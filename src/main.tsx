import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';
import './styles/layout.css';
import './styles/charts.css';
import { initDB } from './store/db';
import { initialStand, tick } from './store/api';
import { App } from './App';

// Хранилище открывается асинхронно: ключ шифрования и расшифровка данных стенда (store/vault.ts)
initDB(initialStand).then(() => {
  // «Сервер» стенда: таймеры эскалации и напоминания бота проверяются раз в секунду в каждой открытой вкладке
  setInterval(() => {
    try {
      tick();
    } catch (e) {
      console.error(e);
    }
  }, 1000);

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
