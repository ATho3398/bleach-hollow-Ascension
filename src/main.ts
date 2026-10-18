import './ui/bha/design-system/tokens.css';
import './ui/bha/design-system/theme-hollow.css';
import './ui/bha/design-system/theme-shinigami.css';
import './ui/bha/design-system/base.css';
import './ui/bha/components/components.css';
import './ui/bha/screens/screens.css';
import './ui/bha/app.css';
import './ui/bha/expedition.css';
import { startApp } from './ui/app';
import { mountSprite } from './ui/bha/sprite';

mountSprite();
const app = document.querySelector<HTMLDivElement>('#app');
if (app) startApp(app);
