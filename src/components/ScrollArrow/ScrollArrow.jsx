import { useEffect, useState } from 'react';
import { FaCircleChevronUp } from 'react-icons/fa6';

import styles from './ScrollArrow.module.scss';

const VISIBILITY_THRESHOLD = 200;

export default function ScrollArrow() {
  const [visible, setVisible] = useState(() => window.scrollY > VISIBILITY_THRESHOLD);

  useEffect(() => {
    const handleScroll = () => setVisible(window.scrollY > VISIBILITY_THRESHOLD);

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      className={styles.arrow}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Scroll to top"
      title="Scroll to top"
    >
      <FaCircleChevronUp aria-hidden="true" />
    </button>
  );
}
