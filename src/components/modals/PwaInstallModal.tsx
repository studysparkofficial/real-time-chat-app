import React from 'react';
import { Download, Home, Smartphone, X } from 'lucide-react';

interface PwaInstallModalProps {
  canInstall: boolean;
  onInstall: () => Promise<void>;
  onClose: () => void;
}

function getManualInstallSteps(): { title: string; steps: string[] } {
  const userAgent = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(userAgent)) {
    return {
      title: 'Add JNUverse from Safari',
      steps: ['Open this page in Safari.', 'Tap Share, then choose “Add to Home Screen”.']
    };
  }
  if (/android/.test(userAgent)) {
    return {
      title: 'Add JNUverse from your browser',
      steps: ['Open the browser menu ⋮.', 'Choose “Install app” or “Add to Home screen”.']
    };
  }
  return {
    title: 'Install JNUverse from your browser',
    steps: ['Open your browser menu.', 'Choose “Install JNUverse” or “Create shortcut”.']
  };
}

export const PwaInstallModal: React.FC<PwaInstallModalProps> = ({
  canInstall,
  onInstall,
  onClose
}) => {
  const manualSteps = getManualInstallSteps();

  return (
    <div className="modal-overlay as-sheet pwa-onboarding-overlay" onClick={onClose}>
      <section
        className="modal-content pwa-onboarding-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwa-onboarding-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="pwa-onboarding-close"
          onClick={onClose}
          aria-label="Maybe later"
        >
          <X size={19} />
        </button>

        <div className="pwa-onboarding-icon" aria-hidden="true">
          <Smartphone size={30} />
        </div>
        <p className="pwa-onboarding-eyebrow">JNUverse on your home screen</p>
        <h2 id="pwa-onboarding-title">Take your campus chat with you</h2>
        <p className="pwa-onboarding-description">
          Install JNUverse for quick, full-screen access to your channels and messages.
        </p>

        {canInstall ? (
          <button type="button" className="pwa-onboarding-install" onClick={() => void onInstall()}>
            <Download size={18} />
            Install JNUverse App
          </button>
        ) : (
          <div className="pwa-manual-instructions">
            <div className="pwa-manual-heading">
              <Home size={17} />
              <strong>{manualSteps.title}</strong>
            </div>
            <ol>
              {manualSteps.steps.map((step) => <li key={step}>{step}</li>)}
            </ol>
          </div>
        )}

        <button type="button" className="pwa-onboarding-later" onClick={onClose}>
          Maybe later
        </button>
      </section>
    </div>
  );
};
