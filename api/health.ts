import { blobMode } from '../server/blob';
import { json, route } from '../server/http';
import { getRepo } from '../server/repo';

export const GET = route(async () => {
  const repo = await getRepo();
  let db = false;
  try {
    db = await repo.health();
  } catch (err) {
    console.error(err);
  }
  return json({ ok: db, storage: { db: repo.mode, blob: blobMode() } }, db ? 200 : 503);
});
