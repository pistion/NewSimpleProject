import { createReadStream, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const landingDir = resolve(process.cwd(), 'landing');

const FrontPageController = {
  serveIndex: (req, res) => {
    const htmlPath = join(landingDir, 'Glondia.html');
    if (!existsSync(htmlPath)) {
      return res.status(404).type('text').send('Landing page not found.');
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    createReadStream(htmlPath).pipe(res);
  },
};

export default FrontPageController;
