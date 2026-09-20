import './styles.css';
import { App } from './ui/app';

const sidebar = document.getElementById('sidebar');
const viewport = document.getElementById('viewport');

if (!sidebar || !viewport) {
  throw new Error('App shell missing #sidebar / #viewport');
}

new App(sidebar, viewport);
