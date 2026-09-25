import './ui/styles.css';
import { startApp } from './app';

startApp().catch((err: unknown) => {
  console.error('House Sim failed to start', err);
});
