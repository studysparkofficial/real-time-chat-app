import React from 'react';

interface BackdropProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MobileDrawerBackdrop: React.FC<BackdropProps> = ({ isOpen, onClose }) => {
  return (
    <div
      className={`drawer-backdrop ${isOpen ? 'active' : ''}`}
      onClick={onClose}
      aria-hidden={!isOpen}
    />
  );
};
