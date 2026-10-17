// Dev-only stand-in for framer-motion when the package is not installed (local preview in the container).
import React from 'react';
const strip = (props) => { const { initial, animate, exit, transition, whileHover, whileTap, layout, variants, ...rest } = props; return rest; };
export const motion = new Proxy({}, { get: (_t, tag) => React.forwardRef((props, ref) => React.createElement(tag, { ...strip(props), ref })) });
export const AnimatePresence = ({ children }) => React.createElement(React.Fragment, null, children);
export const useReducedMotion = () => true;
export const animate = (from, to, options = {}) => { if (options.onUpdate) options.onUpdate(to); if (options.onComplete) options.onComplete(); return { stop() {} }; };
