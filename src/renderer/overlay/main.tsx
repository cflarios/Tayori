import { createRoot } from 'react-dom/client';
import { OverlayApp } from './OverlayApp';
import './overlay.css';

const container = document.getElementById('root');
if (!container) throw new Error('No se encontró #root en overlay/index.html');

createRoot(container).render(<OverlayApp />);
