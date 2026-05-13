// Onboarding modal (Phase 8 / 004 rebrand, D9.3).
//
// Shown on first plugin launch (no last_indexed_at meta yet). Picks the
// embedding provider, gates AI curation behind an explicit opt-in, and
// kicks off the initial scanVault when the user clicks "Index now".

import { App, Modal, Notice, requestUrl } from "obsidian";
import type VaultSearchPlugin from "../main";
import type { ApiFormat, EmbeddingProviderType } from "../types";
import { t } from "../i18n";

type AICurationChoice = "yes" | "no";

interface OnboardingChoice {
    provider: EmbeddingProviderType;
    aiCuration: AICurationChoice;
    indexNow: boolean;
}

export class OnboardingModal extends Modal {
    private chosenProvider: EmbeddingProviderType = "wasm";
    private chosenAICuration: AICurationChoice = "no";
    private ollamaReachable = false;
    private openaiUrl = "http://localhost:11434/v1";
    private openaiModel = "";
    private openaiKey = "";
    private endpointBody!: HTMLDivElement;
    private statusEls = {} as Record<EmbeddingProviderType, HTMLDivElement>;

    constructor(
        app: App,
        private plugin: VaultSearchPlugin,
        private onComplete: (choice: OnboardingChoice) => void,
    ) {
        super(app);
    }

    onOpen(): void {
        this.titleEl.setText(t.onboardingTitle);
        this.contentEl.createEl("p", { text: t.onboardingIntro, cls: "vault-search-onboarding-intro" });

        // ── Provider section
        this.contentEl.createEl("h4", { text: t.onboardingProviderHeading });
        const providerGroup = this.contentEl.createDiv({ cls: "vault-search-onboarding-providers" });
        this.buildProviderOption(providerGroup, "wasm", t.embeddingProviderBuiltin, t.builtinModelNote);
        this.buildProviderOption(providerGroup, "ollama", t.embeddingProviderOllama, "");
        this.buildProviderOption(providerGroup, "openai-compatible", t.embeddingProviderOpenAI, "");

        // OpenAI fields (only shown when provider === "openai-compatible")
        this.endpointBody = this.contentEl.createDiv({ cls: "vault-search-onboarding-endpoint" });
        this.endpointBody.style.display = "none";
        this.buildOpenAIFields(this.endpointBody);

        // ── AI Curation section
        this.contentEl.createEl("h4", { text: t.onboardingAIHeading });
        const aiGroup = this.contentEl.createDiv({ cls: "vault-search-onboarding-ai" });
        this.buildAIOption(aiGroup, "no", t.onboardingAINo);
        this.buildAIOption(aiGroup, "yes", t.onboardingAIYes);

        // ── Buttons
        const btnRow = this.contentEl.createDiv({ cls: "vault-search-modal-btnrow" });
        const skipBtn = btnRow.createEl("button", { text: t.onboardingLater });
        skipBtn.addEventListener("click", () => {
            this.onComplete({ provider: this.chosenProvider, aiCuration: this.chosenAICuration, indexNow: false });
            this.close();
        });

        const indexBtn = btnRow.createEl("button", { text: t.onboardingIndexNow });
        indexBtn.addClass("mod-cta");
        indexBtn.addEventListener("click", () => {
            if (this.chosenAICuration === "yes" && this.chosenProvider === "wasm") {
                new Notice(t.onboardingAIRequiresLlm, 8000);
                return;
            }
            this.onComplete({ provider: this.chosenProvider, aiCuration: this.chosenAICuration, indexNow: true });
            this.close();
        });

        void this.detectOllama();
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private buildProviderOption(
        parent: HTMLElement,
        value: EmbeddingProviderType,
        label: string,
        note: string,
    ) {
        const row = parent.createDiv({ cls: "vault-search-onboarding-option" });
        const radio = row.createEl("input", { type: "radio", attr: { name: "vault-search-provider", value } });
        if (value === this.chosenProvider) radio.checked = true;
        row.createEl("label", { text: label });
        const status = row.createDiv({ cls: "vault-search-onboarding-status" });
        this.statusEls[value] = status;
        if (note) {
            row.createDiv({ text: note, cls: "vault-search-onboarding-note" });
        }
        radio.addEventListener("change", () => {
            if (radio.checked) {
                this.chosenProvider = value;
                this.endpointBody.style.display = value === "openai-compatible" ? "" : "none";
            }
        });
    }

    private buildAIOption(parent: HTMLElement, value: AICurationChoice, label: string) {
        const row = parent.createDiv({ cls: "vault-search-onboarding-option" });
        const radio = row.createEl("input", { type: "radio", attr: { name: "vault-search-ai", value } });
        if (value === this.chosenAICuration) radio.checked = true;
        row.createEl("label", { text: label });
        radio.addEventListener("change", () => {
            if (radio.checked) this.chosenAICuration = value;
        });
    }

    private buildOpenAIFields(parent: HTMLElement) {
        const urlInput = this.makeLabeledInput(parent, t.onboardingOpenaiEndpoint, this.openaiUrl);
        urlInput.addEventListener("input", () => { this.openaiUrl = urlInput.value.trim(); });

        const modelInput = this.makeLabeledInput(parent, t.onboardingOpenaiModel, this.openaiModel);
        modelInput.addEventListener("input", () => { this.openaiModel = modelInput.value.trim(); });

        const keyInput = this.makeLabeledInput(parent, t.apiKeyLabel, this.openaiKey);
        keyInput.type = "password";
        keyInput.addEventListener("input", () => { this.openaiKey = keyInput.value.trim(); });

        const testRow = parent.createDiv({ cls: "vault-search-onboarding-test" });
        const testBtn = testRow.createEl("button", { text: t.onboardingTestConnection });
        const testStatus = testRow.createSpan({ cls: "vault-search-onboarding-test-status" });
        testBtn.addEventListener("click", async () => {
            testStatus.setText("...");
            const ok = await this.testOpenAI(this.openaiUrl, this.openaiKey);
            testStatus.setText(ok ? t.onboardingTestOk : t.onboardingTestFail);
        });
    }

    private makeLabeledInput(parent: HTMLElement, label: string, initial: string): HTMLInputElement {
        const row = parent.createDiv({ cls: "vault-search-onboarding-field" });
        row.createEl("label", { text: label });
        const input = row.createEl("input", { type: "text" });
        input.value = initial;
        return input;
    }

    private async detectOllama() {
        const status = this.statusEls.ollama;
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 1000);
            const resp = await fetch("http://localhost:11434/api/tags", {
                signal: controller.signal,
            });
            clearTimeout(timer);
            this.ollamaReachable = resp.ok;
            status.setText(resp.ok ? t.onboardingOllamaDetected : t.onboardingOllamaNotDetected);
        } catch {
            this.ollamaReachable = false;
            status.setText(t.onboardingOllamaNotDetected);
        }
    }

    private async testOpenAI(url: string, key: string): Promise<boolean> {
        if (!url) return false;
        try {
            const base = url.replace(/\/$/, "");
            const target = base.endsWith("/v1") ? `${base}/models` : `${base}/v1/models`;
            const resp = await requestUrl({
                url: target,
                method: "GET",
                headers: key ? { Authorization: `Bearer ${key}` } : {},
                throw: false,
            });
            return resp.status >= 200 && resp.status < 300;
        } catch {
            return false;
        }
    }
}

/** Apply the user's onboarding choices to plugin settings, then optionally kick off the initial rebuild. */
export async function applyOnboardingChoice(
    plugin: VaultSearchPlugin,
    choice: OnboardingChoice,
): Promise<void> {
    plugin.settings.embeddingProvider = choice.provider;
    plugin.settings.enableAICuration = choice.aiCuration === "yes";
    if (choice.provider === "ollama") {
        plugin.settings.apiFormat = "ollama" satisfies ApiFormat;
    } else if (choice.provider === "openai-compatible") {
        plugin.settings.apiFormat = "openai" satisfies ApiFormat;
    }
    await plugin.saveSettings();
    await plugin.reloadBackends();

    if (choice.indexNow) {
        void plugin.rebuildIndex();
    }
}
