import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './style.css';

const root = document.getElementById('root');
if (!root) throw new Error('popup root element missing');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
