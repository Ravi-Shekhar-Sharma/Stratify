import { useEffect, useRef } from 'react';
import { motion, useMotionValue, useTransform, useReducedMotion } from 'motion/react';
import { animate } from 'motion';
import { VALUE_CHANGE } from '@/motion';

interface Props {
  value: number;
  format: (v: number) => string;
  className?: string;
}

/**
 * Animates a number tweening from its previous value to a new one — the
 * "data value changing" motion the redesign calls for. Built on
 * useMotionValue + animate() rather than React state: the tween updates the
 * DOM text directly through motion's own render loop (motion.span accepts a
 * MotionValue<string> as children), so a fast-ticking value never forces a
 * React re-render on every animation frame.
 *
 * Never animates on first mount (that would be an entrance, not a state
 * change): the first render jumps straight to the real value.
 */
export function AnimatedNumber({ value, format, className }: Props) {
  const motionValue = useMotionValue(value);
  const display = useTransform(motionValue, (v) => format(v));
  const isFirstRender = useRef(true);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      motionValue.set(value);
      return;
    }
    if (reduceMotion) {
      motionValue.set(value);
      return;
    }
    const controls = animate(motionValue, value, VALUE_CHANGE);
    return () => controls.stop();
  }, [value, reduceMotion, motionValue]);

  return <motion.span className={className}>{display}</motion.span>;
}
