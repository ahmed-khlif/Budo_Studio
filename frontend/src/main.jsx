import React from 'react';
import { createRoot } from 'react-dom/client';
import AuthGate from './AuthGate';
import '../../style.css';
import './premium.css';

createRoot(document.getElementById('root')).render(<AuthGate />);
