import { useCallback, useEffect, useState } from 'react';
import {
  adviseLocalModels,
  type SecretKey,
  type SecretsPresence,
  type Settings,
  type SetupProgress,
  type SystemSpecs,
} from '@shared/types';
import type { WhisperProgress } from '@shared/ipc';
import { Icon } from './icons';
import { Mascot } from '@renderer/Mascot';
import { Tx, useT } from '@renderer/i18n';
import type { UIKey } from '@shared/i18n';

/**
 * First-run setup wizard.
 *
 * ## What problem it solves
 *
 * The old «First steps» card was a **task list**: it told you what was missing
 * and sent you off to the relevant section to do it yourself. That works if you
 * already know what a provider, an API key and a vision-capable model are. For
 * someone opening the app for the first time, each step was a decision with its
 * own vocabulary, and the very first one —«local or cloud»— demands knowing how
 * much RAM you have and whether your GPU is up to it. Nobody should have to know
 * that just to try out an app.
 *
 * The wizard **does it**, it doesn't ask: it measures the machine, recommends a
 * path with the reason, installs Ollama if needed, downloads the models that
 * fit that machine, and also settles the transcription — which is the step that
 * gets forgotten and without which the app hears nothing.
 *
 * ## The two rules that govern it
 *
 * - **Nothing is installed or downloaded without asking.** Every action that
 *   touches the machine sits behind a button that says up front what it will
 *   do. There's no path that installs on startup.
 * - **You can leave at any time.** Someone who already knows what they're doing
 *   closes the wizard and uses the dashboard. A wizard you can't escape is a
 *   cage, not a help.
 */

type Step = 'welcome' | 'brain' | 'voice' | 'context' | 'done';
type Path = 'cloud' | 'local';

export function SetupWizard({
  settings,
  presence,
  patch,
  saveSecret,
  onClose,
}: {
  settings: Settings;
  presence: SecretsPresence;
  patch: (p: Partial<Settings>) => Promise<void>;
  saveSecret: (key: SecretKey, value: string) => Promise<void>;
  onClose: () => void;
}) {
  const t = useT();
  const [step, setStep] = useState<Step>('welcome');
  const [path, setPath] = useState<Path | null>(null);
  const [specs, setSpecs] = useState<SystemSpecs | null>(null);

  useEffect(() => {
    void window.api.system.getSpecs().then(setSpecs);
  }, []);

  const steps: Step[] = ['welcome', 'brain', 'voice', 'context', 'done'];
  const at = steps.indexOf(step);

  /*
   * Free navigation, up at the top and not inside each step.
   *
   * Before, each step brought its own «Back» and none brought «Next»: you could
   * go back from some places and not others, and to skip a step that didn't
   * apply —I already have the key, I already have the models— you had to run it
   * anyway. A wizard you can't leave is a cage, and one you can't skip past is
   * nearly the same thing.
   *
   * Each step's button is still its action («Install», «Save and test»); this
   * is only moving around. That's why «Next» says «Skip» when the step hasn't
   * been done yet: passing it by without doing it is legitimate, but it's worth
   * making that visible.
   */
  const goTo = (index: number): void => {
    const next = steps[Math.min(Math.max(index, 0), steps.length - 1)];
    if (next) setStep(next);
  };

  return (
    <div className="wiz">
      <header className="wiz__head">
        <div>
          <div className="wiz__eyebrow">{t('wiz.eyebrow')}</div>
          <h1 className="wiz__title">{t(TITLES[step])}</h1>
        </div>
        {/* Exit always visible: someone who knows what they're doing shouldn't
            have to finish a wizard to reach the settings. */}
        <button className="btn btn--ghost" onClick={onClose}>
          {t('wiz.exit')}
        </button>
      </header>

      <div className="wiz__nav">
        <button className="btn btn--ghost" disabled={at === 0} onClick={() => goTo(at - 1)}>
          {t('wiz.back')}
        </button>

        <div className="wiz__rail">
          {steps.map((id, index) => (
            <span
              key={id}
              className={`wiz__dot${index === at ? ' wiz__dot--now' : ''}${index < at ? ' wiz__dot--done' : ''}`}
            />
          ))}
        </div>

        <button
          className="btn btn--ghost"
          // From the welcome you can't skip: with no path chosen, the next step
          // wouldn't know what to show. It's disabled rather than doing nothing
          // when pressed — a button that doesn't respond is indistinguishable
          // from a broken one.
          disabled={at === steps.length - 1 || (step === 'welcome' && !path)}
          onClick={() => goTo(at + 1)}
          title={step === 'welcome' && !path ? t('wiz.pickFirst') : t('wiz.skipTitle')}
        >
          {t('wiz.skip')}
        </button>
      </div>

      <div className="wiz__body">
        {step === 'welcome' && (
          <Welcome
            specs={specs}
            onPick={(chosen) => {
              setPath(chosen);
              setStep('brain');
            }}
          />
        )}

        {step === 'brain' && path === 'cloud' && (
          <CloudStep
            settings={settings}
            presence={presence}
            patch={patch}
            saveSecret={saveSecret}
            onDone={() => setStep('voice')}
            onBack={() => setStep('welcome')}
          />
        )}

        {step === 'brain' && path === 'local' && (
          <LocalStep
            settings={settings}
            specs={specs}
            patch={patch}
            onDone={() => setStep('voice')}
            onBack={() => setStep('welcome')}
          />
        )}

        {step === 'voice' && (
          <VoiceStep
            settings={settings}
            presence={presence}
            path={path}
            patch={patch}
            onDone={() => setStep('context')}
          />
        )}

        {step === 'context' && (
          <ContextStep settings={settings} patch={patch} onDone={() => setStep('done')} />
        )}

        {step === 'done' && <DoneStep settings={settings} onClose={onClose} patch={patch} />}
      </div>
    </div>
  );
}

const TITLES: Record<Step, UIKey> = {
  welcome: 'wiz.titleWelcome',
  brain: 'wiz.titleBrain',
  voice: 'wiz.titleVoice',
  context: 'wiz.titleContext',
  done: 'wiz.titleDone',
};

// ────────────────────────────── 1 · Welcome ──────────────────────────────

/**
 * The local/cloud choice, with the machine already measured.
 *
 * The recommendation is computed, not guessed: below 16 GB a decent local model
 * doesn't fit, and without a dedicated GPU the latency ruins the use case —the
 * answer is read while someone is looking at you—. The reason is stated next to
 * the recommendation so you can go against it with judgment.
 */
function Welcome({ specs, onPick }: { specs: SystemSpecs | null; onPick: (path: Path) => void }) {
  const t = useT();
  if (!specs) return <p className="wiz__lead">{t('wiz.measuring')}</p>;

  const advice = adviseLocalModels(specs);
  const localIsViable = specs.totalMemoryGB >= 16 && Boolean(specs.gpu);

  return (
    <>
      <div className="wiz__welcome">
        <Mascot className="wiz__mascot" autoBlink />
      </div>
      <p className="wiz__lead">{t('wiz.lead')}</p>

      <div className="specs">
        <span className="specs__item">
          <strong>{specs.totalMemoryGB} GB</strong> {t('local.ram')}
        </span>
        <span className="specs__item">
          {t('local.cores', { cores: specs.cpuCores, cpu: specs.cpuModel })}
        </span>
        {specs.gpu && (
          <span className="specs__item">
            {t('local.gpu')} <strong>{specs.gpu}</strong>
          </span>
        )}
      </div>

      <p className="wiz__note">{t(advice.tier, { ram: specs.totalMemoryGB })}</p>

      <div className="wiz__paths">
        <PathCard
          icon="cloud"
          title={t('wiz.cloud')}
          recommended={!localIsViable}
          bullets={[t('wiz.cloudB1'), t('wiz.cloudB2'), t('wiz.cloudB3')]}
          cta={t('wiz.cloudCta')}
          onPick={() => onPick('cloud')}
        />
        <PathCard
          icon="laptop"
          title={t('wiz.local')}
          recommended={localIsViable}
          bullets={[t('wiz.localB1'), t('wiz.localB2'), t('wiz.localB3')]}
          cta={t('wiz.localCta')}
          onPick={() => onPick('local')}
        />
      </div>

      <p className="wiz__note">{localIsViable ? t('wiz.localViable') : t('wiz.localWeak')}</p>
    </>
  );
}

function PathCard({
  icon,
  title,
  bullets,
  cta,
  recommended,
  onPick,
}: {
  icon: 'cloud' | 'laptop';
  title: string;
  bullets: string[];
  cta: string;
  recommended: boolean;
  onPick: () => void;
}) {
  const t = useT();
  return (
    <section className={`pathcard${recommended ? ' pathcard--pick' : ''}`}>
      <div className="pathcard__head">
        <span className="hero__icon">
          <Icon name={icon} size={19} />
        </span>
        <h2 className="pathcard__title">{title}</h2>
        {recommended && <span className="badge badge--ok">{t('wiz.recommended')}</span>}
      </div>
      <ul className="pathcard__list">
        {bullets.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <button className="btn btn--primary" onClick={onPick}>
        {cta}
      </button>
    </section>
  );
}

// ──────────────────────────── 2a · Cloud path ────────────────────────────

const CLOUD_PROVIDERS = [
  {
    id: 'claude' as const,
    secret: 'anthropic' as const,
    label: 'Claude (Anthropic)',
    model: 'claude-sonnet-5',
    where: 'console.anthropic.com → API Keys',
    note: 'wiz.claudeNote' as UIKey,
  },
  {
    id: 'gemini' as const,
    secret: 'google' as const,
    label: 'Gemini (Google)',
    model: 'gemini-3.6-flash',
    where: 'aistudio.google.com → Get API key',
    note: 'wiz.geminiNote' as UIKey,
  },
  {
    id: 'openai' as const,
    secret: 'openai' as const,
    label: 'ChatGPT (OpenAI)',
    model: 'gpt-5.6-terra',
    where: 'platform.openai.com → API keys',
    note: 'wiz.openaiNote' as UIKey,
  },
  {
    id: 'deepseek' as const,
    secret: 'deepseek' as const,
    label: 'DeepSeek',
    model: 'deepseek-v4-flash',
    where: 'platform.deepseek.com → API keys',
    note: 'wiz.deepseekNote' as UIKey,
  },
];

function CloudStep({
  settings,
  presence,
  patch,
  saveSecret,
  onDone,
  onBack,
}: {
  settings: Settings;
  presence: SecretsPresence;
  patch: (p: Partial<Settings>) => Promise<void>;
  saveSecret: (key: SecretKey, value: string) => Promise<void>;
  onDone: () => void;
  onBack: () => void;
}) {
  const t = useT();
  const [choice, setChoice] = useState(CLOUD_PROVIDERS[0]!);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Indexed by the provider's own key rather than a chain of ternaries: with
  // two providers that read fine, with the third it was already a branch you
  // have to update every time and that gives no warning when forgotten.
  const alreadyThere = presence[choice.secret];

  const apply = async (): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      if (key.trim()) await saveSecret(choice.secret, key.trim());

      /*
       * The provider is set BEFORE testing: `testConnection` uses the active
       * provider from the settings, so testing before saving it would check the
       * previous one and report all is well while the new key is still
       * unvalidated.
       */
      /*
       * Merged with whatever was already there. The first version rewrote the
       * whole map and wiped the Ollama model of anyone passing through here to
       * try the cloud: choosing one provider is no reason to throw away the
       * configuration of the other two.
       */
      await patch({
        llmProviderId: choice.id,
        llmModels: { ...settings.llmModels, [choice.id]: choice.model },
      });

      const result = await window.api.llm.testConnection();
      if (!result.ok) {
        setError(result.error ?? t('wiz.connectionFailed'));
        return;
      }
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="wiz__lead">{t('wiz.cloudLead')}</p>

      <div className="wiz__choices">
        {CLOUD_PROVIDERS.map((provider) => (
          <button
            key={provider.id}
            className={`choice${choice.id === provider.id ? ' choice--on' : ''}`}
            onClick={() => setChoice(provider)}
          >
            <span className="choice__title">{provider.label}</span>
            <span className="choice__note">{t(provider.note)}</span>
          </button>
        ))}
      </div>

      <label className="wiz__label" htmlFor="wiz-key">
        {t('wiz.apiKey')}{' '}
        {alreadyThere && <span className="badge badge--ok">{t('wiz.alreadyHave')}</span>}
      </label>
      <div className="field">
        <input
          id="wiz-key"
          type="password"
          value={key}
          placeholder={alreadyThere ? t('wiz.keepExisting') : t('wiz.pasteKey')}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (key.trim() || alreadyThere)) void apply();
          }}
        />
      </div>
      <p className="wiz__note">{t('wiz.whereToGet', { where: choice.where })}</p>

      {error && <div className="warn">{error}</div>}

      <div className="field wiz__actions">
        <button className="btn" onClick={onBack} disabled={busy}>
          {t('wiz.backPlain')}
        </button>
        <button
          className="btn btn--primary"
          disabled={busy || (!key.trim() && !alreadyThere)}
          onClick={() => void apply()}
        >
          {busy ? t('wiz.testingKey') : t('wiz.saveAndTest')}
        </button>
      </div>
    </>
  );
}

// ──────────────────────────── 2b · Local path ────────────────────────────

/**
 * Install Ollama and pull the models that fit this machine.
 *
 * The models come from `adviseLocalModels`, which already existed for the
 * dashboard card: the same criteria, applied without anyone having to read it.
 * **Two** are downloaded because conversing and reading the screen ask for
 * different things —one fast and one with vision—, which is the conclusion this
 * project had already reached and that a new user has no way of knowing.
 */
function LocalStep({
  settings,
  specs,
  patch,
  onDone,
  onBack,
}: {
  settings: Settings;
  specs: SystemSpecs | null;
  patch: (p: Partial<Settings>) => Promise<void>;
  onDone: () => void;
  onBack: () => void;
}) {
  const t = useT();
  const [reachable, setReachable] = useState<boolean | null>(null);
  /**
   * Installed isn't the same as running, and confusing them was a real bug:
   * someone who installed Ollama and came back to the wizard with the service
   * stopped hit «You don't have it installed» and the install button again.
   * Reinstalling over the top fixes nothing; what's needed is to open it.
   */
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState<SetupProgress | null>(null);
  const [error, setError] = useState('');

  /** Models that Ollama reports as already downloaded. */
  const [downloaded, setDownloaded] = useState<string[]>([]);

  const check = useCallback((): void => {
    void window.api.ollama.getStatus().then((status) => {
      setReachable(status.reachable);
      setDownloaded(status.models.map((m) => m.id));
    });
    void window.api.setup.ollamaInstalled().then(setInstalled);
  }, []);

  useEffect(() => {
    check();
    void window.api.setup.canInstall().then(setCanInstall);
    return window.api.setup.onProgress(setProgress);
  }, [check]);

  const install = async (): Promise<void> => {
    setBusy(t('wiz.installing'));
    setError('');
    try {
      const result = await window.api.setup.installOllama();
      if (!result.ok) {
        setError(result.error ?? t('wiz.installFailed'));
        // The state is re-read rather than left as it was: the most common
        // failure case is "it installed but the server didn't start", and the
        // right move there is to move to the «open it once» screen, not repeat
        // the install.
        check();
        return;
      }
      setInstalled(true);
      setReachable(true);
    } finally {
      setBusy('');
      setProgress(null);
    }
  };

  const advice = specs ? adviseLocalModels(specs) : null;

  /**
   * Whether a recommended model is already downloaded.
   *
   * The implicit tag is tolerated: Ollama lists `llama3.2:latest` for what was
   * downloaded as `llama3.2`, and an exact comparison would send you to repeat
   * a multi-gigabyte download that's already done.
   */
  const has = (model: string): boolean => {
    const base = model.includes(':') ? model : `${model}:latest`;
    return downloaded.some((id) => id === model || id === base);
  };

  /** Both are already here: nothing to download, just to select them. */
  const nothingToDownload = Boolean(advice && has(advice.chat.model) && has(advice.vision.model));

  const download = async (): Promise<void> => {
    if (!advice) return;
    setBusy(nothingToDownload ? t('wiz.configuring') : t('wiz.downloadingModels'));
    setError('');
    try {
      for (const model of [advice.chat.model, advice.vision.model]) {
        // What's already here isn't requested again: `ollama pull` on a
        // downloaded model breaks nothing, but it's slow to check the manifest
        // and leaves the user watching a bar for work that isn't needed.
        if (has(model)) continue;

        const result = await window.api.setup.pullModel(model);
        if (!result.ok) {
          setError(result.error ?? t('wiz.downloadFailed', { model }));
          return;
        }
      }

      /*
       * The two roles stay separate from day one: the conversing one asks for
       * latency and the screen one asks for vision.
       *
       * Merged with whatever was already there, for the same reason as in the
       * cloud path: choosing local is no reason to wipe the model someone had
       * chosen in Claude, Gemini or ChatGPT. The previous version wrote the
       * whole map by hand, so you also had to remember to add a key with every
       * new provider — and the `as` let it slip through silently.
       */
      await patch({
        llmProviderId: 'ollama',
        llmModels: { ...settings.llmModels, ollama: advice.chat.model },
        screenProviderId: 'ollama',
        screenModel: advice.vision.model,
      });
      onDone();
    } finally {
      setBusy('');
      setProgress(null);
    }
  };

  const pct =
    progress?.totalBytes && progress.totalBytes > 0
      ? Math.round(((progress.receivedBytes ?? 0) / progress.totalBytes) * 100)
      : null;

  /**
   * The progress, visible in ALL phases.
   *
   * It used to live inside the "Ollama is ready" branch, so during the
   * install —which is exactly the part that takes minutes— nothing showed: the
   * button changed its text and stayed there. The main process was already
   * emitting the messages («Installing with winget…», «Waiting for the server
   * to start…»); what was missing was showing them.
   *
   * The percentage only appears when there is one: winget gives no progress, so
   * painting a bar at 0% for three minutes would lie more than the text.
   */
  const avance = busy ? (
    <div className="progress">
      <div className="progress__label">
        {progress?.model ? `${progress.model} — ` : ''}
        {progress?.message ?? busy}
        {pct !== null ? ` · ${pct}%` : ''}
      </div>
      <div className="progress__bar">
        <div
          className={`progress__fill${pct === null ? ' progress__fill--idle' : ''}`}
          style={pct !== null ? { width: `${pct}%` } : undefined}
        />
      </div>
    </div>
  ) : null;

  return (
    <>
      {reachable === false && (
        <>
          <p className="wiz__lead">
            {t('wiz.ollamaIs')} {installed ? t('wiz.installedNotRunning') : t('wiz.notInstalled')}
          </p>

          {/*
            Installed and stopped: installing again fixes nothing. What's needed
            is to open it once — Ollama stays resident afterwards.
          */}
          {installed ? (
            <>
              <p className="wiz__note">{t('wiz.openItOnce')}</p>
              {error && <div className="warn">{error}</div>}
              <div className="field wiz__actions">
                <button className="btn" onClick={onBack}>
                  {t('wiz.backPlain')}
                </button>
                <button className="btn btn--primary" onClick={check}>
                  {t('wiz.recheck')}
                </button>
              </div>
            </>
          ) : canInstall ? (
            <>
              <p className="wiz__note">
                <Tx k="wiz.wingetNote" />
              </p>

              {/* The install takes minutes: without this, the only sign that
                  something is happening was the button's text. */}
              {avance}
              {error && <div className="warn">{error}</div>}

              <div className="field wiz__actions">
                <button className="btn" onClick={onBack} disabled={Boolean(busy)}>
                  {t('wiz.backPlain')}
                </button>
                <button
                  className="btn btn--primary"
                  disabled={Boolean(busy)}
                  onClick={() => void install()}
                >
                  {busy || t('wiz.installOllama')}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="warn">
                <Tx k="wiz.noWinget" />
              </div>
              <div className="field wiz__actions">
                <button className="btn" onClick={onBack}>
                  {t('wiz.backPlain')}
                </button>
                <button className="btn btn--primary" onClick={check}>
                  {t('wiz.recheck')}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {reachable === true && advice && (
        <>
          <p className="wiz__lead">
            {nothingToDownload ? t('wiz.ollamaReadyAll') : t('wiz.ollamaReady')}
          </p>

          <div className="wiz__models">
            <div className="wizmodel">
              <span className="wizmodel__role">
                {t('wiz.forChat')} {has(advice.chat.model) && <em>{t('wiz.alreadyDownloaded')}</em>}
              </span>
              <code className="wizmodel__id">{advice.chat.model}</code>
              <span className="wizmodel__note">{t(advice.chat.note)}</span>
            </div>
            <div className="wizmodel">
              <span className="wizmodel__role">
                {t('wiz.forScreen')}{' '}
                {has(advice.vision.model) && <em>{t('wiz.alreadyDownloaded')}</em>}
              </span>
              <code className="wizmodel__id">{advice.vision.model}</code>
              <span className="wizmodel__note">{t(advice.vision.note)}</span>
            </div>
          </div>

          <div className="warn">{t(advice.caveat)}</div>

          {!nothingToDownload && <p className="wiz__note">{t('wiz.sizeNote')}</p>}

          {avance}

          {error && <div className="warn">{error}</div>}

          <div className="field wiz__actions">
            <button className="btn" onClick={onBack} disabled={Boolean(busy)}>
              {t('wiz.backPlain')}
            </button>
            <button
              className="btn btn--primary"
              disabled={Boolean(busy)}
              onClick={() => void download()}
            >
              {busy || (nothingToDownload ? t('wiz.useThese') : t('wiz.downloadAndSet'))}
            </button>
          </div>
        </>
      )}

      {reachable === null && <p className="wiz__lead">{t('wiz.lookingForOllama')}</p>}
    </>
  );
}

// ────────────────────────────── 3 · Speech to text ──────────────────────────────

/**
 * The step that gets forgotten.
 *
 * A user who pastes a Claude key and considers the setup finished is left with
 * the app **mute**: the default transcription engine is Gemini Live, which
 * needs a Google key that person doesn't have. The symptom is the worst
 * possible one —listening on, meters moving and not a single word transcribed—
 * so here it's settled once and for all, choosing an engine that can actually
 * work with what's configured.
 */
function VoiceStep({
  settings,
  presence,
  path,
  patch,
  onDone,
}: {
  settings: Settings;
  presence: SecretsPresence;
  /**
   * The path chosen in the welcome, which here decides what's offered.
   *
   * Showing all five options to everyone was inconsistent with what the person
   * just decided: someone who chose «on my machine» to send nothing outside
   * shouldn't have to dodge the cloud engines again two screens later, and
   * someone who chose the cloud doesn't want to download 150 MB of Whisper.
   * What fits the decision already made is what's offered.
   */
  path: Path | null;
  patch: (p: Partial<Settings>) => Promise<void>;
  onDone: () => void;
}) {
  const t = useT();
  const [status, setStatus] = useState({ binaryInstalled: false, modelInstalled: false });
  const [progress, setProgress] = useState<WhisperProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void window.api.whisper.getStatus().then(setStatus);
    return window.api.whisper.onProgress(setProgress);
  }, []);

  const ready = status.binaryInstalled && status.modelInstalled;
  const canUseGemini = presence.google;
  const canUseOpenAI = presence.openai;

  /*
   * With «on your machine» only Whisper is offered. The cloud ones aren't
   * worse, they're the opposite of what that choice asked for.
   */
  const showCloud = path !== 'local';
  const showLocal = path !== 'cloud';

  const pick = async (sttProviderId: Settings['sttProviderId']): Promise<void> => {
    await patch({ sttProviderId });
    onDone();
  };

  const pickWhisper = async (): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      if (!ready) {
        const result = await window.api.whisper.install();
        if (!result.ok) {
          setError(result.error ?? t('stt.downloadFailed'));
          return;
        }
      }
      await patch({ sttProviderId: 'whisper-local' });
      onDone();
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const pct =
    progress && progress.totalBytes > 0
      ? Math.round((progress.receivedBytes / progress.totalBytes) * 100)
      : null;

  return (
    <>
      <p className="wiz__lead">
        {showCloud && showLocal
          ? t('wiz.voiceBoth')
          : showLocal
            ? t('wiz.voiceLocal')
            : t('wiz.voiceCloud')}
      </p>

      <div className="wiz__choices">
        {/* OpenAI first, and recommended: it's the model its own maker points
            to for live audio, which is literally what this app does. Gemini
            Live is just as fast and has the advantage of sharing a key with the
            answers. */}
        {showCloud && (
          <button
            className={`choice${canUseOpenAI ? ' choice--on' : ''}`}
            disabled={!canUseOpenAI}
            onClick={() => void pick('openai-live')}
          >
            <span className="choice__title">
              {t('wiz.openaiLiveTitle')} {canUseOpenAI && t('wiz.recommendedSuffix')}
            </span>
            <span className="choice__note">
              {canUseOpenAI ? t('wiz.openaiLiveOk') : t('wiz.openaiLiveNoKey')}
            </span>
          </button>
        )}

        {showCloud && (
          <button
            className="choice"
            disabled={!canUseGemini}
            onClick={() => void pick('gemini-live')}
          >
            <span className="choice__title">{t('wiz.geminiLiveTitle')}</span>
            <span className="choice__note">
              {canUseGemini ? t('wiz.geminiLiveOk') : t('wiz.geminiLiveNoKey')}
            </span>
          </button>
        )}

        {showLocal && (
          <button className="choice" disabled={busy} onClick={() => void pickWhisper()}>
            <span className="choice__title">{t('wiz.whisperTitle')}</span>
            <span className="choice__note">
              {ready ? t('wiz.whisperReady') : t('wiz.whisperNew')}
            </span>
          </button>
        )}
      </div>

      {/* With no cloud key at all, the cloud path is left with no clickable
          options: you have to say where the way out is instead of leaving two
          grayed-out buttons. */}
      {showCloud && !showLocal && !canUseOpenAI && !canUseGemini && (
        <div className="warn">
          <Tx k="wiz.noSttKey" />
        </div>
      )}

      {busy && (
        <div className="progress">
          <div className="progress__label">
            {progress?.target === 'binary' ? t('stt.progressBinary') : t('stt.progressModel')}
            {pct !== null ? ` — ${pct}%` : ''}
          </div>
          <div className="progress__bar">
            <div className="progress__fill" style={{ width: `${pct ?? 0}%` }} />
          </div>
        </div>
      )}

      {error && <div className="warn">{error}</div>}

      {settings.sttProviderId === 'gemini-live' && !canUseGemini && (
        <div className="warn">{t('wiz.geminiLiveStuck')}</div>
      )}
    </>
  );
}

// ─────────────────────────────── 4 · Context ───────────────────────────────

/**
 * The CV, which is what separates a correct answer from one of yours.
 *
 * It can be skipped —someone coming to try the app shouldn't have to paste
 * their working life in the first minute— but what's lost is explained, because
 * the model is **forbidden** from inventing experience and without this the
 * answers come out generic with no way to understand why.
 */
function ContextStep({
  settings,
  patch,
  onDone,
}: {
  settings: Settings;
  patch: (p: Partial<Settings>) => Promise<void>;
  onDone: () => void;
}) {
  const t = useT();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (): Promise<void> => {
    setBusy(true);
    try {
      if (text.trim()) {
        await patch({
          contextPacks: [
            ...settings.contextPacks,
            {
              id: crypto.randomUUID(),
              // The UI key, not `CONTEXT_KIND_LABEL`: that one labels the
              // blocks sent to the model and stays in Spanish, but this is the
              // name the user will see under «Context».
              name: t('ctx.kindCv'),
              content: text.trim(),
              enabled: true,
              kind: 'cv',
              profiles: [settings.promptProfileId],
            },
          ],
        });
      }
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="wiz__lead">{t('wiz.cvLead')}</p>
      <p className="wiz__note">{t('wiz.cvNote')}</p>

      <textarea
        placeholder={t('wiz.cvPlaceholder')}
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{ minHeight: 200 }}
      />

      <div className="field wiz__actions">
        <button className="btn" onClick={onDone} disabled={busy}>
          {t('wiz.notNow')}
        </button>
        <button
          className="btn btn--primary"
          disabled={busy || !text.trim()}
          onClick={() => void save()}
        >
          {t('wiz.saveAndFinish')}
        </button>
      </div>
    </>
  );
}

// ──────────────────────────────── 5 · Done ────────────────────────────────

function DoneStep({
  settings,
  patch,
  onClose,
}: {
  settings: Settings;
  patch: (p: Partial<Settings>) => Promise<void>;
  onClose: () => void;
}) {
  const t = useT();
  const finish = (): void => {
    void patch({ onboardingDone: true }).then(onClose);
  };

  const model = settings.llmModels[settings.llmProviderId];

  return (
    <>
      <p className="wiz__lead">{t('wiz.doneLead')}</p>

      <ul className="wiz__summary">
        <li>
          <Icon name="check" size={15} /> {t('wiz.answers')}{' '}
          <strong>{model || settings.llmProviderId}</strong> ({settings.llmProviderId})
        </li>
        <li>
          <Icon name="check" size={15} /> {t('wiz.transcribes')}{' '}
          <strong>{t(STT_LABEL[settings.sttProviderId])}</strong>
        </li>
        <li>
          <Icon name="check" size={15} />{' '}
          {settings.contextPacks.some((pack) => pack.kind === 'cv' && pack.content.trim())
            ? t('wiz.cvLoaded')
            : t('wiz.noCv')}
        </li>
      </ul>

      <p className="wiz__note">{t('wiz.doneNote')}</p>

      <div className="field wiz__actions">
        <button className="btn btn--primary" onClick={finish}>
          {t('wiz.startUsing')}
        </button>
      </div>
    </>
  );
}

const STT_LABEL: Record<Settings['sttProviderId'], UIKey> = {
  'gemini-live': 'wiz.sttGeminiLive',
  'gemini-audio': 'wiz.sttGeminiAudio',
  'openai-live': 'wiz.sttOpenaiLive',
  'openai-transcribe': 'wiz.sttOpenaiTranscribe',
  'whisper-local': 'wiz.sttWhisper',
};
