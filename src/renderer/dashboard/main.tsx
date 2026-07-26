import { createRoot } from 'react-dom/client';
import { DashboardApp } from './DashboardApp';
import './dashboard.css';

const container = document.getElementById('root');
if (!container) throw new Error('No se encontró #root en dashboard/index.html');

createRoot(container).render(<DashboardApp />);
