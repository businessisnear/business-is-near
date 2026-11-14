import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
export default{root,base:'/__vault/',build:{outDir:path.join(root,'dist'),emptyOutDir:false,rollupOptions:{input:{main:path.join(root,'index.html'),callback:path.join(root,'wallet-auth-callback.html')}}}};
