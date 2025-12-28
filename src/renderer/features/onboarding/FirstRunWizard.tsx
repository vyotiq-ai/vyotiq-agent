/**
 * FirstRunWizard - Terminal-styled welcome wizard for first-time users
 * 
 * Guides users through initial setup with the app's terminal aesthetic:
 * 1. Welcome and overview
 * 2. API key configuration
 * 3. Feature preferences
 * 4. Completion
 */
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Sparkles,
  Key,
  Sliders,
  CheckCircle,
  ChevronRight,
  ChevronLeft,
  ExternalLink,
  AlertCircle,
  Brain,
  Eye,
  EyeOff,
  X,
  Terminal,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from '../../components/ui/Button';
import { ProviderIcon } from '../../components/ui/ProviderIcons';
import type { LLMProviderName, AutonomousFeatureFlags } from '../../../shared/types';
import { DEFAULT_AUTONOMOUS_FEATURE_FLAGS } from '../../../shared/types';
import { PROVIDER_ORDER, PROVIDERS } from '../../../shared/providers';

interface FirstRunWizardProps {
  onComplete: (config: {
    apiKeys: Partial<Record<LLMProviderName, string>>;
    autonomousFlags: Partial<AutonomousFeatureFlags>;
  }) => void;
  onSkip: () => void;
}

type WizardStep = 'welcome' | 'api-keys' | 'features' | 'complete';

const STEPS: WizardStep[] = ['welcome', 'api-keys', 'features', 'complete'];

const STEP_COMMANDS: Record<WizardStep, string> = {
  'welcome': 'init',
  'api-keys': 'auth',
  'features': 'config',
  'complete': 'ready',
};

const ProviderLinks: Record<LLMProviderName, string> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  gemini: 'https://aistudio.google.com/app/apikey',
  deepseek: 'https://platform.deepseek.com/api_keys',
  openrouter: 'https://openrouter.ai/keys',
};

export const FirstRunWizard: React.FC<FirstRunWizardProps> = ({ onComplete, onSkip }) => {
  const [currentStep, setCurrentStep] = useState<WizardStep>('welcome');
  const [apiKeys, setApiKeys] = useState<Partial<Record<LLMProviderName, string>>>({});
  const [showKeys, setShowKeys] = useState<Record<LLMProviderName, boolean>>({} as Record<LLMProviderName, boolean>);
  const [autonomousFlags, setAutonomousFlags] = useState<Partial<AutonomousFeatureFlags>>({
    enableTaskPlanning: DEFAULT_AUTONOMOUS_FEATURE_FLAGS.enableTaskPlanning,
  });

  const currentStepIndex = useMemo(() => STEPS.indexOf(currentStep), [currentStep]);
  
  const hasAnyApiKey = useMemo(
    () => Object.values(apiKeys).some(key => key && key.trim().length > 0),
    [apiKeys]
  );

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSkip();
    };
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [onSkip]);

  const goNext = useCallback(() => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex]);
    }
  }, [currentStepIndex]);

  const goBack = useCallback(() => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex]);
    }
  }, [currentStepIndex]);

  const handleComplete = useCallback(() => {
    onComplete({ apiKeys, autonomousFlags });
  }, [apiKeys, autonomousFlags, onComplete]);

  const toggleShowKey = useCallback((provider: LLMProviderName) => {
    setShowKeys(prev => ({ ...prev, [provider]: !prev[provider] }));
  }, []);

  const updateApiKey = useCallback((provider: LLMProviderName, value: string) => {
    setApiKeys(prev => ({ ...prev, [provider]: value }));
  }, []);

  const toggleFlag = useCallback((flag: keyof AutonomousFeatureFlags) => {
    setAutonomousFlags(prev => ({
      ...prev,
      [flag]: !prev[flag],
    }));
  }, []);

  // Render step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 'welcome':
        return (
          <div className="space-y-4">
            <div className="text-[10px] text-[var(--color-text-muted)] font-mono">
              # Welcome to Vyotiq - AI-powered coding assistant
            </div>
            
            <div className="space-y-2 text-[11px] text-[var(--color-text-secondary)] font-mono">
              <p>
                <span className="text-[var(--color-accent-primary)]">$</span> vyotiq --version
              </p>
              <p className="text-[var(--color-text-primary)]">v1.0.0</p>
            </div>

            <div className="border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)]">
              <div className="px-3 py-2 border-b border-[var(--color-border-subtle)] text-[9px] text-[var(--color-text-muted)]">
                # features
              </div>
              <div className="p-3 space-y-2">
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="text-[var(--color-success)]">✓</span>
                  <span className="text-[var(--color-text-muted)]">--provider</span>
                  <span className="text-[var(--color-text-secondary)]">Multi-provider AI with automatic routing</span>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="text-[var(--color-success)]">✓</span>
                  <span className="text-[var(--color-text-muted)]">--analyze</span>
                  <span className="text-[var(--color-text-secondary)]">Automatic task decomposition</span>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="text-[var(--color-success)]">✓</span>
                  <span className="text-[var(--color-text-muted)]">--tools</span>
                  <span className="text-[var(--color-text-secondary)]">File editing, terminal, browser integration</span>
                </div>
              </div>
            </div>

            <div className="text-[10px] text-[var(--color-text-muted)] font-mono">
              <span className="text-[var(--color-accent-primary)]">›</span> Press continue to configure providers...
            </div>
          </div>
        );

      case 'api-keys':
        return (
          <div className="space-y-4">
            <div className="text-[10px] text-[var(--color-text-muted)] font-mono">
              # Configure at least one provider to start
            </div>

            <div className="space-y-2">
              {PROVIDER_ORDER.map(provider => {
                const providerInfo = PROVIDERS[provider];
                const hasKey = !!apiKeys[provider]?.trim();
                return (
                  <div
                    key={provider}
                    className={cn(
                      'border transition-colors',
                      hasKey
                        ? 'border-[var(--color-success)]/50 bg-[var(--color-success)]/5'
                        : 'border-[var(--color-border-subtle)] bg-[var(--color-surface-2)]'
                    )}
                  >
                    <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-subtle)]">
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className={cn('text-[var(--color-text-muted)]', providerInfo.color)}>
                          <ProviderIcon provider={provider} size={12} />
                        </span>
                        <span className="text-[var(--color-text-primary)]">--{provider}</span>
                        {hasKey && (
                          <span className="text-[var(--color-success)]">[configured]</span>
                        )}
                      </div>
                      <a
                        href={ProviderLinks[provider]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[9px] text-[var(--color-accent-primary)] hover:underline flex items-center gap-1"
                      >
                        get key <ExternalLink size={8} />
                      </a>
                    </div>
                    <div className="px-3 py-2">
                      <div className="relative flex items-center">
                        <span className="text-[10px] text-[var(--color-text-muted)] mr-2">$</span>
                        <input
                          type={showKeys[provider] ? 'text' : 'password'}
                          placeholder={`export ${provider.toUpperCase()}_API_KEY=...`}
                          value={apiKeys[provider] || ''}
                          onChange={(e) => updateApiKey(provider, e.target.value)}
                          className={cn(
                            'flex-1 bg-transparent text-[10px] font-mono',
                            'text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)]',
                            'focus:outline-none'
                          )}
                        />
                        <button
                          type="button"
                          onClick={() => toggleShowKey(provider)}
                          className="ml-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                        >
                          {showKeys[provider] ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {!hasAnyApiKey && (
              <div className="flex items-start gap-2 px-3 py-2 border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5">
                <AlertCircle size={12} className="text-[var(--color-warning)] mt-0.5 flex-shrink-0" />
                <span className="text-[10px] text-[var(--color-warning)] font-mono">
                  [WARN] at least one API key required
                </span>
              </div>
            )}
          </div>
        );

      case 'features':
        return (
          <div className="space-y-4">
            <div className="text-[10px] text-[var(--color-text-muted)] font-mono">
              # Enable autonomous features (can change later in config)
            </div>

            <div className="space-y-2">
              <button
                onClick={() => toggleFlag('enableTaskPlanning')}
                className={cn(
                  'w-full text-left border transition-colors',
                  autonomousFlags.enableTaskPlanning
                    ? 'border-[var(--color-accent-primary)]/50 bg-[var(--color-accent-primary)]/5'
                    : 'border-[var(--color-border-subtle)] bg-[var(--color-surface-2)]'
                )}
              >
                <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-subtle)]">
                  <div className="flex items-center gap-2 text-[10px]">
                    <Brain size={12} className={autonomousFlags.enableTaskPlanning ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-text-muted)]'} />
                    <span className="text-[var(--color-text-primary)]">--analyze</span>
                    <span className="text-[9px] px-1 py-0.5 bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]">recommended</span>
                  </div>
                  <span className={cn(
                    'text-[10px]',
                    autonomousFlags.enableTaskPlanning ? 'text-[var(--color-success)]' : 'text-[var(--color-text-muted)]'
                  )}>
                    [{autonomousFlags.enableTaskPlanning ? 'ON' : 'OFF'}]
                  </span>
                </div>
                <div className="px-3 py-2">
                  <p className="text-[10px] text-[var(--color-text-secondary)] font-mono">
                    Analyze requests to understand intent and complexity before execution
                  </p>
                </div>
              </button>
            </div>

            <div className="text-[9px] text-[var(--color-text-muted)] font-mono">
              # Advanced features (dynamic tools) available in config --autonomous
            </div>
          </div>
        );

      case 'complete':
        return (
          <div className="space-y-4">
            <div className="text-[10px] text-[var(--color-text-muted)] font-mono">
              # Setup complete
            </div>
            
            <div className="border border-[var(--color-success)]/30 bg-[var(--color-success)]/5">
              <div className="flex items-center gap-2 px-3 py-2 text-[10px]">
                <CheckCircle size={12} className="text-[var(--color-success)]" />
                <span className="text-[var(--color-success)] font-mono">[OK] vyotiq ready</span>
              </div>
            </div>

            <div className="border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)]">
              <div className="px-3 py-2 border-b border-[var(--color-border-subtle)] text-[9px] text-[var(--color-text-muted)]">
                # quick reference
              </div>
              <div className="p-3 space-y-1.5 text-[10px] font-mono">
                <div className="flex items-center gap-2">
                  <kbd className="px-1.5 py-0.5 bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] text-[var(--color-accent-primary)] text-[9px]">Ctrl+,</kbd>
                  <span className="text-[var(--color-text-secondary)]">open config</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="px-1.5 py-0.5 bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] text-[var(--color-accent-primary)] text-[9px]">Ctrl+K</kbd>
                  <span className="text-[var(--color-text-secondary)]">command palette</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="px-1.5 py-0.5 bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] text-[var(--color-accent-primary)] text-[9px]">/</kbd>
                  <span className="text-[var(--color-text-secondary)]">focus chat input</span>
                </div>
              </div>
            </div>

            {!hasAnyApiKey && (
              <div className="flex items-start gap-2 px-3 py-2 border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5">
                <AlertCircle size={12} className="text-[var(--color-warning)] mt-0.5 flex-shrink-0" />
                <span className="text-[10px] text-[var(--color-warning)] font-mono">
                  [WARN] no API keys configured - add via config --providers
                </span>
              </div>
            )}

            <div className="text-[10px] text-[var(--color-text-muted)] font-mono">
              <span className="text-[var(--color-accent-primary)]">›</span> Type a message in the chat to begin...
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-3 py-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-150 font-mono"
        role="dialog"
        aria-modal="true"
      >
        {/* Terminal header bar */}
        <div className="flex items-center justify-between px-3 py-2 bg-[var(--color-surface-header)] border-b border-[var(--color-border-subtle)]">
          <div className="flex items-center gap-3">
            {/* Traffic lights */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={onSkip}
                className="w-2.5 h-2.5 rounded-full bg-[var(--color-error)] opacity-80 hover:opacity-100 transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
                aria-label="Close"
              />
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-warning)] opacity-80" />
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-success)] opacity-80" />
            </div>
            <div>
              <h2 className="text-[11px] text-[var(--color-text-primary)]">setup --{STEP_COMMANDS[currentStep]}</h2>
              <p className="text-[9px] text-[var(--color-text-muted)]">step {currentStepIndex + 1}/{STEPS.length}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onSkip}
            className="h-6 w-6 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            aria-label="Skip setup"
          >
            <X size={14} />
          </Button>
        </div>

        {/* Progress bar */}
        <div className="h-0.5 bg-[var(--color-surface-3)]">
          <div 
            className="h-full bg-[var(--color-accent-primary)] transition-all duration-300"
            style={{ width: `${((currentStepIndex + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        {/* Step indicators with icons */}
        <div className="flex items-center justify-center gap-4 px-4 py-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-2)]/50">
          {STEPS.map((step, idx) => {
            const isActive = idx === currentStepIndex;
            const isComplete = idx < currentStepIndex;
            const StepIcon = step === 'welcome' ? Terminal
              : step === 'api-keys' ? Key
              : step === 'features' ? Sliders
              : CheckCircle;
            return (
              <div
                key={step}
                className={cn(
                  'flex items-center gap-1 text-[9px] font-mono transition-colors',
                  isActive ? 'text-[var(--color-accent-primary)]'
                    : isComplete ? 'text-[var(--color-success)]'
                    : 'text-[var(--color-text-dim)]'
                )}
              >
                <StepIcon size={10} />
                <span>{STEP_COMMANDS[step]}</span>
              </div>
            );
          })}
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)] scrollbar-track-transparent">
          {renderStepContent()}
        </div>

        {/* Footer / Status bar */}
        <div className="border-t border-[var(--color-border-subtle)] px-3 py-2 flex items-center justify-between bg-[var(--color-surface-header)]">
          <div className="text-[10px]">
            {currentStep === 'welcome' ? (
              <button
                onClick={onSkip}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
              >
                :skip
              </button>
            ) : currentStep !== 'complete' ? (
              <Button variant="ghost" size="xs" onClick={goBack}>
                <ChevronLeft size={10} />
                :back
              </Button>
            ) : (
              <span className="text-[var(--color-text-muted)]">
                # press enter or click to start
              </span>
            )}
          </div>

          <div>
            {currentStep === 'complete' ? (
              <Button variant="primary" size="sm" onClick={handleComplete}>
                :start <Sparkles size={10} />
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={goNext}>
                :next <ChevronRight size={10} />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FirstRunWizard;
