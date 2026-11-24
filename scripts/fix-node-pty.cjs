// node-pty 1.1.0 npm paketinde macOS/Linux yardımcı süreci (spawn-helper) çalıştırma izni olmadan geliyor.
// İzin olmadan her terminal açılışı "posix_spawnp failed" hatasıyla düşer; paketlenen .app da bu dosyayı taşır.
const { chmodSync, existsSync, readdirSync } = require('node:fs')
const { join } = require('node:path')

if (process.platform === 'win32') process.exit(0)

let root
try {
  root = join(require.resolve('node-pty/package.json'), '..')
} catch {
  process.exit(0)
}

const candidates = [join(root, 'build', 'Release', 'spawn-helper')]
const prebuilds = join(root, 'prebuilds')
if (existsSync(prebuilds)) {
  for (const dir of readdirSync(prebuilds)) candidates.push(join(prebuilds, dir, 'spawn-helper'))
}

for (const file of candidates) {
  if (!existsSync(file)) continue
  chmodSync(file, 0o755)
  console.log('chmod 755', file)
}
