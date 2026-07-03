import { boot } from './main';

boot().catch((err) => {
  console.error('boot failed', err);
});
