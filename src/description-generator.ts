// Description Generator — selection-based (Phase 6 / 004 rebrand)
//
// Phase 6 demotion (design.md D7): the v0.3.x "scan whole vault → write
// preview report → apply" pipeline is removed. Description is now an opt-in
// per-note action — triggered from commands, the file-menu, or the Discover
// sidebar. Embedding ranking no longer depends on description (D3), so this
// module is pure UX glue: LLM call → frontmatter merge → wikilink defense.

import { Notice, TFile } from "obsidian";
import type VaultSearchPlugin from "./main";
import { checkOllama, requestLlmJson, stripFrontmatter } from "./utils";
import { t } from "./i18n";

const BODY_CAP = 2000;

export class DescriptionGenerator {
    constructor(private plugin: VaultSearchPlugin) {}

    /** True when settings have a usable LLM endpoint + model configured. */
    hasLlmConfigured(): boolean {
        const { ollamaUrl, llmModel } = this.plugin.settings;
        return !!ollamaUrl && !!llmModel;
    }

    /** Generate + write description for a single note. Returns true on success. */
    async generateForActiveNote(file: TFile): Promise<boolean> {
        if (!this.hasLlmConfigured()) {
            new Notice(t.descNoLlmConfigured);
            return false;
        }
        const { ollamaUrl } = this.plugin.settings;
        if (!await checkOllama(ollamaUrl)) {
            new Notice(t.ollamaNotReady);
            return false;
        }
        return this.runOne(file);
    }

    /** Generate + write description for many notes (sequential). */
    async generateForFiles(files: TFile[]): Promise<void> {
        if (files.length === 0) return;
        if (!this.hasLlmConfigured()) {
            new Notice(t.descNoLlmConfigured);
            return;
        }
        const { ollamaUrl } = this.plugin.settings;
        if (!await checkOllama(ollamaUrl)) {
            new Notice(t.ollamaNotReady);
            return;
        }

        const progress = new Notice(t.descGenerating(0, files.length), 0);
        let ok = 0;
        let failed = 0;
        for (let i = 0; i < files.length; i++) {
            const success = await this.runOne(files[i], /*silent=*/true);
            if (success) ok++;
            else failed++;
            progress.setMessage(t.descGenerating(i + 1, files.length));
            await new Promise(r => setTimeout(r, 0));
        }
        progress.hide();
        new Notice(t.descBatchDone(ok, failed), 8000);
    }

    /** Core path: build prompt → call LLM → merge frontmatter. */
    private async runOne(file: TFile, silent = false): Promise<boolean> {
        const { ollamaUrl, llmModel } = this.plugin.settings;
        const title = this.extractTitle(file);
        const body = stripFrontmatter(await this.plugin.app.vault.cachedRead(file)).slice(0, BODY_CAP);
        const cache = this.plugin.app.metadataCache.getFileCache(file);
        const existingTags: string[] = (() => {
            const raw = cache?.frontmatter?.tags;
            if (Array.isArray(raw)) return raw.map(String);
            if (typeof raw === "string") return raw.split(",").map(s => s.trim()).filter(Boolean);
            return [];
        })();

        // Show a live progress notice in single-note mode (batch mode handles
        // its own progress). qwen3:1.7b round-trip is 4-8s — silence feels broken.
        const progress = silent ? null : new Notice(t.descGeneratingOne(file.basename), 0);

        try {
            let result: { description: string; tags?: string[] };
            try {
                result = await this.callLLM(ollamaUrl, llmModel, title, body);
            } catch (e) {
                console.warn(`vault-curate: LLM failed for ${file.path}`, e);
                if (!silent) new Notice(t.descLlmFailed(file.basename));
                return false;
            }

            let description = (result.description ?? "").trim();
            // Defense: reject "description = title" (model echoing back the title).
            if (description && description.replace(/[_\-\s]/g, "") === title.replace(/[_\-\s]/g, "")) {
                try {
                    const retry = await this.callLLM(ollamaUrl, llmModel, title, body);
                    const retryDesc = (retry.description ?? "").trim();
                    if (retryDesc && retryDesc.replace(/[_\-\s]/g, "") !== title.replace(/[_\-\s]/g, "")) {
                        description = retryDesc;
                        if (retry.tags) result = { description: retryDesc, tags: retry.tags };
                    } else {
                        if (!silent) new Notice(t.descLlmFailed(file.basename));
                        return false;
                    }
                } catch (e) {
                    console.warn(`vault-curate: LLM retry failed for ${file.path}`, e);
                    if (!silent) new Notice(t.descLlmFailed(file.basename));
                    return false;
                }
            }

            if (!description) {
                if (!silent) new Notice(t.descLlmFailed(file.basename));
                return false;
            }

            const mergedTags = this.mergeTags(existingTags, result.tags);

            try {
                await this.plugin.app.fileManager.processFrontMatter(file, (fm) => {
                    fm.description = description;
                    if (mergedTags) fm.tags = mergedTags;
                    if (!fm.title) fm.title = title;
                });
            } catch (e) {
                console.warn(`vault-curate: frontmatter merge failed for ${file.path}`, e);
                if (!silent) new Notice(t.descLlmFailed(file.basename));
                return false;
            }

            if (!silent) new Notice(t.descGeneratedOne(file.basename));
            return true;
        } finally {
            progress?.hide();
        }
    }

    private extractTitle(file: TFile): string {
        const cache = this.plugin.app.metadataCache.getFileCache(file);
        let raw = String(
            cache?.frontmatter?.title
            ?? cache?.headings?.find(h => h.level === 1)?.heading
            ?? file.basename,
        );
        // Strip wikilink syntax (defense against historical bad data).
        if (raw.startsWith("[[") && raw.endsWith("]]")) {
            raw = raw.slice(2, -2);
            const pipe = raw.indexOf("|");
            if (pipe >= 0) raw = raw.slice(pipe + 1);
            else {
                const slash = raw.lastIndexOf("/");
                if (slash >= 0) raw = raw.slice(slash + 1);
            }
        }
        return raw;
    }

    private mergeTags(existing: string[], generated: string[] | undefined): string[] | null {
        if (!generated || generated.length === 0) return null;
        const normalized = new Set(existing.map(s => s.toLowerCase().replace(/^#/, "")));
        const added = generated.filter(s => !normalized.has(s.toLowerCase()));
        if (added.length === 0) return null;
        return [...existing, ...added];
    }

    private async callLLM(
        url: string,
        model: string,
        title: string,
        content: string,
    ): Promise<{ description: string; tags?: string[] }> {
        return requestLlmJson(
            {
                ollamaUrl: url,
                llmModel: model,
                apiFormat: this.plugin.settings.apiFormat,
                apiKey: this.plugin.settings.apiKey,
            },
            t.llmPrompt(title, content),
            (raw) => this.parseGeneratedJSON(raw),
        );
    }

    private parseGeneratedJSON(raw: string): { description: string; tags?: string[] } {
        const tryParse = (text: string): { description: string; tags?: string[] } | null => {
            try {
                const parsed = JSON.parse(text);
                const desc = (parsed.description ?? parsed.summary ?? "").slice(0, 500);
                const tags = Array.isArray(parsed.tags)
                    ? parsed.tags
                        .map(String)
                        .map((s: string) => s.replace(/\s+/g, "_"))
                        .filter((s: string) => s !== "..." && s !== "…" && s.length > 0)
                    : undefined;
                return { description: desc, tags };
            } catch { return null; }
        };

        return tryParse(raw)
            ?? tryParse(raw.replace(/```json\n?|\n?```/g, "").trim())
            ?? { description: raw.slice(0, 200) };
    }
}
