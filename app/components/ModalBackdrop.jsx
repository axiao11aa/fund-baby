'use client';

import { useRef } from 'react';
import { motion } from 'framer-motion';

// A click synthesized after dragging out of a child can target the backdrop.
// Dismiss only when the gesture both starts and ends on the backdrop itself.
export default function ModalBackdrop({ onClick, children, ...props }) {
  const startedOutside = useRef(false);
  return (
    <motion.div
      {...props}
      onPointerDown={event => {
        startedOutside.current = event.target === event.currentTarget && event.button === 0;
      }}
      onPointerCancel={() => { startedOutside.current = false; }}
      onClick={event => {
        const dismiss = startedOutside.current && event.target === event.currentTarget;
        startedOutside.current = false;
        if (dismiss) onClick?.(event);
      }}
    >
      {children}
    </motion.div>
  );
}
