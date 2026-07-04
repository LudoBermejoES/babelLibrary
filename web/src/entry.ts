import { boot, showBootError } from './main';

boot().catch(showBootError);
