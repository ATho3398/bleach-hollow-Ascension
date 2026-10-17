import './ui/style.css';
import { startApp } from './ui/app';

const app = document.querySelector<HTMLDivElement>('#app');
if (app) startApp(app);
