import React, { useState } from 'react';
import { X, ZoomIn, ZoomOut, Download, RotateCw } from 'lucide-react';

interface LightboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string | null;
  fileName?: string;
}

export const LightboxModal: React.FC<LightboxModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  fileName = 'JNUverse_Image'
}) => {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);

  if (!isOpen || !imageUrl) return null;

  const handleZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale((prev) => Math.min(prev + 0.3, 3));
  };

  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale((prev) => Math.max(prev - 0.3, 0.5));
  };

  const handleRotate = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRotation((prev) => (prev + 90) % 360);
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        background: 'rgba(0, 0, 0, 0.9)',
        padding: '12px'
      }}
    >
      {/* Top Floating Control Bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(30, 41, 59, 0.85)',
          backdropFilter: 'blur(8px)',
          borderRadius: '12px',
          padding: '6px 12px',
          zIndex: 1001,
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}
      >
        <button
          onClick={handleZoomIn}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            padding: '6px',
            display: 'flex'
          }}
          title="Zoom In"
        >
          <ZoomIn size={20} />
        </button>

        <button
          onClick={handleZoomOut}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            padding: '6px',
            display: 'flex'
          }}
          title="Zoom Out"
        >
          <ZoomOut size={20} />
        </button>

        <button
          onClick={handleRotate}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            padding: '6px',
            display: 'flex'
          }}
          title="Rotate"
        >
          <RotateCw size={18} />
        </button>

        <a
          href={imageUrl}
          download={fileName}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            padding: '6px',
            display: 'flex'
          }}
          title="Download Full Resolution"
        >
          <Download size={20} />
        </a>

        <div style={{ width: '1px', height: '20px', background: 'rgba(255, 255, 255, 0.2)', margin: '0 4px' }} />

        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#ef4444',
            cursor: 'pointer',
            padding: '6px',
            display: 'flex'
          }}
          title="Close Lightbox"
        >
          <X size={22} />
        </button>
      </div>

      {/* Main Image Stage */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '90vw',
          maxHeight: '85vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden'
        }}
      >
        <img
          src={imageUrl}
          alt={fileName}
          style={{
            maxWidth: '100%',
            maxHeight: '85vh',
            objectFit: 'contain',
            borderRadius: '8px',
            transform: `scale(${scale}) rotate(${rotation}deg)`,
            transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            userSelect: 'none'
          }}
        />
      </div>
    </div>
  );
};
