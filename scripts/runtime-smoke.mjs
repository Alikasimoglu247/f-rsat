import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";

// Controlled synthetic storage test. No network, OAuth account or production volume.
const image = process.argv[2] ?? "firsatradar:local";
if (!/^[a-z0-9][a-z0-9/:._-]*$/i.test(image))
  throw new Error("Invalid image name");
const volume = `firsatradar-token-test-${randomUUID()}`;
const testEnv = {
  ...process.env,
  GMAIL_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64url"),
};
function run(args) {
  const result = spawnSync("docker", args, { env: testEnv, stdio: "inherit" });
  if (result.status !== 0) throw new Error("Container acceptance check failed");
}
const base = [
  "run",
  "--rm",
  "--network",
  "none",
  "-v",
  `${volume}:/var/lib/firsatradar/tokens`,
  "-e",
  "GMAIL_TOKEN_ENCRYPTION_KEY",
  "-e",
  "GMAIL_TOKEN_STORE=/var/lib/firsatradar/tokens/gmail.enc",
  "-e",
  "GMAIL_TOKEN_STORE_PERSISTENT=true",
  image,
  "node",
  "--import",
  "tsx",
  "--input-type=module",
  "-e",
];
try {
  run([
    ...base,
    `
    import {saveTokens,GMAIL_SCOPE} from './src/lib/email/secrets.ts';
    if(process.getuid()===0) throw Error('Runtime must not run as root');
    await saveTokens({accessToken:'synthetic-volume-test',refreshToken:'synthetic-volume-test',expiresAt:Date.now()+3600000,scope:GMAIL_SCOPE,accountHash:'a'.repeat(64)});
    console.log('Synthetic encrypted token written; network disabled');
  `,
  ]);
  run([
    ...base,
    `
    import {readTokens,tokenStorageStatus} from './src/lib/email/secrets.ts';
    import {stat,readFile} from 'node:fs/promises';
    const t=await readTokens();
    if(t.refreshToken!=='synthetic-volume-test'||!tokenStorageStatus().declaredPersistent) throw Error('Persistence mismatch');
    const file='/var/lib/firsatradar/tokens/gmail.enc';
    if(((await stat(file)).mode&0o777)!==0o600||((await stat('/var/lib/firsatradar/tokens')).mode&0o777)!==0o700) throw Error('Permission mismatch');
    if((await readFile(file,'utf8')).includes('synthetic-volume-test')) throw Error('Plaintext token');
    console.log('Separate container restart read verified; permissions 0600/0700');
  `,
  ]);
} finally {
  const removed = spawnSync("docker", ["volume", "rm", volume], {
    env: testEnv,
    stdio: "pipe",
  });
  if (removed.status !== 0)
    throw new Error("Synthetic test volume cleanup failed");
}
