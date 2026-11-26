/// <reference types="@withfig/autocomplete-types" />
/**
 * Fig deposunda bulunmayan Windows araçları için tamamlama spec'leri (Fig biçiminde).
 * Açıklamalar, Fig spec'leriyle tutarlı olsun diye araçların kendi yardım metinleri gibi İngilizcedir.
 */

/** `wsl --list --quiet` çıktısı UTF-16 gelir; NUL karakterleri atılır. */
const wslDistros: Fig.Generator = {
  script: ['wsl', '--list', '--quiet'],
  postProcess: (out) =>
    out
      .replace(/\0/g, '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((name) => ({ name, description: 'WSL distribution' }))
}

const wingetPackageArg: Fig.Arg = { name: 'query', description: 'Package id, name or moniker' }
const wingetCommonOptions: Fig.Option[] = [
  { name: ['--id'], description: 'Filter results by id', args: { name: 'id' } },
  { name: ['--name'], description: 'Filter results by name', args: { name: 'name' } },
  { name: ['-e', '--exact'], description: 'Find package using exact match' },
  { name: ['-s', '--source'], description: 'Find package using the specified source', args: { name: 'source', suggestions: ['winget', 'msstore'] } },
  { name: ['--accept-source-agreements'], description: 'Accept all source agreements during source operations' },
  { name: ['--disable-interactivity'], description: 'Disable interactive prompts' }
]
const wingetInstallOptions: Fig.Option[] = [
  ...wingetCommonOptions,
  { name: ['-v', '--version'], description: 'Use the specified version', args: { name: 'version' } },
  { name: ['--scope'], description: 'Select install scope', args: { name: 'scope', suggestions: ['user', 'machine'] } },
  { name: ['-i', '--interactive'], description: 'Request interactive installation' },
  { name: ['-h', '--silent'], description: 'Request silent installation' },
  { name: ['-l', '--location'], description: 'Location to install to', args: { name: 'path', template: 'folders' } },
  { name: ['--override'], description: 'Override arguments to be passed on to the installer', args: { name: 'args' } },
  { name: ['--force'], description: 'Direct run the command and continue with non security related issues' },
  { name: ['--accept-package-agreements'], description: 'Accept all license agreements for packages' }
]

const winget: Fig.Spec = {
  name: 'winget',
  description: 'Windows Package Manager',
  subcommands: [
    { name: 'install', description: 'Installs the given package', args: wingetPackageArg, options: wingetInstallOptions },
    { name: 'show', description: 'Shows information about a package', args: wingetPackageArg, options: wingetCommonOptions },
    { name: 'source', description: 'Manage sources of packages', subcommands: [
      { name: 'add', description: 'Add a new source', options: [{ name: ['-n', '--name'], args: { name: 'name' } }, { name: ['-a', '--arg'], args: { name: 'url' } }] },
      { name: 'list', description: 'List current sources' },
      { name: 'update', description: 'Update current sources' },
      { name: 'remove', description: 'Remove current sources', args: { name: 'name' } },
      { name: 'reset', description: 'Reset sources' },
      { name: 'export', description: 'Export current sources' }
    ] },
    { name: 'search', description: 'Find and show basic info of packages', args: wingetPackageArg, options: [...wingetCommonOptions, { name: ['-n', '--count'], description: 'Show no more than specified number of results', args: { name: 'count' } }] },
    { name: 'list', description: 'Display installed packages', args: { ...wingetPackageArg, isOptional: true }, options: [...wingetCommonOptions, { name: ['--upgrade-available'], description: 'Lists only packages which have an upgrade available' }] },
    { name: ['upgrade', 'update'], description: 'Shows and performs available upgrades', args: { ...wingetPackageArg, isOptional: true }, options: [...wingetInstallOptions, { name: ['-r', '--recurse', '--all'], description: 'Upgrade all installed packages to latest if available' }, { name: ['-u', '--include-unknown'], description: 'Upgrade packages even if their current version cannot be determined' }] },
    { name: ['uninstall', 'remove', 'rm'], description: 'Uninstalls the given package', args: wingetPackageArg, options: [...wingetCommonOptions, { name: ['-h', '--silent'], description: 'Request silent uninstall' }, { name: ['--purge'], description: 'Deletes all files and directories in the package directory (portable)' }] },
    { name: 'hash', description: 'Helper to hash installer files', args: { name: 'file', template: 'filepaths' } },
    { name: 'validate', description: 'Validates a manifest file', args: { name: 'manifest', template: 'filepaths' } },
    { name: 'settings', description: 'Open settings or set administrator settings', subcommands: [{ name: 'export', description: 'Export settings' }, { name: 'set', description: 'Sets the value of an admin setting' }, { name: 'reset', description: 'Resets an admin setting to its default value' }] },
    { name: 'features', description: 'Shows the status of experimental features' },
    { name: 'export', description: 'Exports a list of the installed packages', options: [{ name: ['-o', '--output'], description: 'File where the result is to be written', args: { name: 'file', template: 'filepaths' } }, { name: ['--include-versions'], description: 'Export package versions' }] },
    { name: 'import', description: 'Installs all the packages in a file', options: [{ name: ['-i', '--import-file'], description: 'File describing the packages to install', args: { name: 'file', template: 'filepaths' } }, { name: ['--ignore-unavailable'], description: 'Ignore unavailable packages' }] },
    { name: 'pin', description: 'Manage package pins', subcommands: [{ name: 'add', description: 'Add a new pin', args: wingetPackageArg }, { name: 'remove', description: 'Remove a package pin', args: wingetPackageArg }, { name: 'list', description: 'List current pins' }, { name: 'reset', description: 'Reset pins' }] },
    { name: 'configure', description: 'Configures the system into a desired state', args: { name: 'file', template: 'filepaths' } },
    { name: 'download', description: 'Downloads the installer from a given package', args: wingetPackageArg, options: [...wingetCommonOptions, { name: ['-d', '--download-directory'], description: 'Directory where the installers are downloaded to', args: { name: 'dir', template: 'folders' } }] },
    { name: 'repair', description: 'Repairs the selected package', args: wingetPackageArg, options: wingetCommonOptions }
  ],
  options: [
    { name: ['-v', '--version'], description: 'Display the version of the tool' },
    { name: '--info', description: 'Display general info of the tool' },
    { name: ['-?', '--help'], description: 'Shows help about the selected command', isPersistent: true }
  ]
}

const chocoPackage: Fig.Arg = { name: 'package', description: 'Package name', isVariadic: true }
const chocoCommon: Fig.Option[] = [
  { name: ['-y', '--yes', '--confirm'], description: 'Confirm all prompts' },
  { name: ['-f', '--force'], description: 'Force the behavior' },
  { name: ['--noop', '--whatif'], description: 'Do not actually do anything' },
  { name: ['-r', '--limit-output'], description: 'Limit the output to essential information' },
  { name: ['-s', '--source'], description: 'Source location for install', args: { name: 'source' } },
  { name: ['--version'], description: 'A specific version to install', args: { name: 'version' } },
  { name: ['--pre', '--prerelease'], description: 'Include prereleases' }
]
const choco: Fig.Spec = {
  name: 'choco',
  description: 'Chocolatey package manager',
  subcommands: [
    { name: 'install', description: 'Installs packages', args: chocoPackage, options: [...chocoCommon, { name: ['--params', '--package-parameters'], description: 'Parameters to pass to the package', args: { name: 'params' } }, { name: ['-i', '--ignore-dependencies'], description: 'Ignore dependencies' }] },
    { name: 'upgrade', description: 'Upgrades packages from various sources', args: { ...chocoPackage, suggestions: ['all'] }, options: chocoCommon },
    { name: 'uninstall', description: 'Uninstalls a package', args: chocoPackage, options: [...chocoCommon, { name: ['-x', '--force-dependencies'], description: 'Uninstall dependencies too' }] },
    { name: ['search', 'find'], description: 'Searches remote packages', args: { name: 'query' }, options: [...chocoCommon, { name: ['-e', '--exact'], description: 'Only return exact matches' }] },
    { name: 'list', description: 'Lists local packages', options: [{ name: ['-r', '--limit-output'], description: 'Limit the output to essential information' }, { name: ['--id-only'], description: 'Only return package ids' }] },
    { name: 'outdated', description: 'Retrieves packages that are outdated' },
    { name: 'info', description: 'Retrieves package information', args: { name: 'package' } },
    { name: 'pin', description: 'Suppress upgrades for a package', subcommands: [{ name: 'list' }, { name: 'add', options: [{ name: ['-n', '--name'], args: { name: 'package' } }] }, { name: 'remove', options: [{ name: ['-n', '--name'], args: { name: 'package' } }] }] },
    { name: 'source', description: 'View and configure default sources', subcommands: [{ name: 'list' }, { name: 'add' }, { name: 'remove' }, { name: 'enable' }, { name: 'disable' }] },
    { name: 'config', description: 'Retrieve and configure config file settings', subcommands: [{ name: 'list' }, { name: 'get' }, { name: 'set' }, { name: 'unset' }] },
    { name: 'feature', description: 'View and configure choco features', subcommands: [{ name: 'list' }, { name: 'enable' }, { name: 'disable' }] },
    { name: 'export', description: 'Exports list of currently installed packages' },
    { name: 'pack', description: 'Packages nuspec into a nupkg', args: { name: 'nuspec', template: 'filepaths' } },
    { name: 'push', description: 'Pushes a compiled nupkg to a source', args: { name: 'nupkg', template: 'filepaths' } },
    { name: 'new', description: 'Generates files necessary for a chocolatey package', args: { name: 'name' } },
    { name: 'help', description: 'Displays top level help information' }
  ],
  options: [{ name: ['-?', '-h', '--help'], description: 'Prints out the help menu', isPersistent: true }, { name: ['-v', '--version'], description: 'Prints out the Chocolatey version' }]
}

const scoopApp: Fig.Arg = { name: 'app', description: 'App name', isVariadic: true }
const scoop: Fig.Spec = {
  name: 'scoop',
  description: 'A command-line installer for Windows',
  subcommands: [
    { name: 'install', description: 'Install apps', args: scoopApp, options: [{ name: ['-g', '--global'], description: 'Install the app globally' }, { name: ['-k', '--no-cache'], description: "Don't use the download cache" }, { name: ['-s', '--skip-hash-check'], description: 'Skip hash validation' }, { name: ['-a', '--arch'], description: 'Use the specified architecture', args: { name: 'arch', suggestions: ['32bit', '64bit', 'arm64'] } }] },
    { name: 'uninstall', description: 'Uninstall an app', args: scoopApp, options: [{ name: ['-g', '--global'], description: 'Uninstall a globally installed app' }, { name: ['-p', '--purge'], description: 'Remove all persistent data' }] },
    { name: 'update', description: 'Update apps, or Scoop itself', args: { ...scoopApp, isOptional: true, suggestions: ['*'] }, options: [{ name: ['-f', '--force'], description: 'Force update even when there is no newer version' }, { name: ['-g', '--global'], description: 'Update a globally installed app' }, { name: ['-a', '--all'], description: 'Update all apps' }] },
    { name: 'search', description: 'Search available apps', args: { name: 'query', isOptional: true } },
    { name: 'list', description: 'List installed apps', args: { name: 'query', isOptional: true } },
    { name: 'info', description: 'Display information about an app', args: { name: 'app' } },
    { name: 'status', description: 'Show status and check for new app versions' },
    { name: 'bucket', description: 'Manage Scoop buckets', subcommands: [{ name: 'add', args: [{ name: 'name', suggestions: ['extras', 'versions', 'nerd-fonts', 'java', 'games', 'nonportable'] }, { name: 'repo', isOptional: true }] }, { name: 'list' }, { name: 'known' }, { name: 'rm', args: { name: 'name' } }] },
    { name: 'cleanup', description: 'Cleanup apps by removing old versions', args: { ...scoopApp, suggestions: ['*'] }, options: [{ name: ['-a', '--all'] }, { name: ['-k', '--cache'], description: 'Remove outdated download cache' }] },
    { name: 'cache', description: 'Show or clear the download cache', subcommands: [{ name: 'show' }, { name: 'rm' }] },
    { name: 'hold', description: 'Hold an app to disable updates', args: scoopApp },
    { name: 'unhold', description: 'Unhold an app to enable updates', args: scoopApp },
    { name: 'reset', description: 'Reset an app to resolve conflicts', args: scoopApp },
    { name: 'which', description: 'Locate a shim/executable', args: { name: 'command' } },
    { name: 'home', description: "Opens the app homepage", args: { name: 'app' } },
    { name: 'checkup', description: 'Check for potential problems' },
    { name: 'config', description: 'Get or set configuration values', args: [{ name: 'name', isOptional: true }, { name: 'value', isOptional: true }] },
    { name: 'export', description: 'Exports installed apps, buckets (and optionally configs) in JSON format' },
    { name: 'import', description: 'Imports apps, buckets and configs from a Scoopfile', args: { name: 'file', template: 'filepaths' } },
    { name: 'help', description: 'Show help for a command', args: { name: 'command', isOptional: true } }
  ]
}

const wsl: Fig.Spec = {
  name: 'wsl',
  description: 'Windows Subsystem for Linux',
  options: [
    { name: ['-d', '--distribution'], description: 'Run the specified distribution', args: { name: 'distro', generators: wslDistros } },
    { name: ['-u', '--user'], description: 'Run as the specified user', args: { name: 'user' } },
    { name: ['-e', '--exec'], description: 'Execute the specified command without using the default Linux shell', args: { name: 'command', isCommand: true } },
    { name: '--cd', description: 'Sets the specified directory as the current working directory', args: { name: 'dir', template: 'folders' } },
    { name: '--shell-type', description: 'Shell type', args: { name: 'type', suggestions: ['standard', 'login', 'none'] } },
    { name: '--install', description: 'Install additional Windows Subsystem for Linux distributions', args: { name: 'distro', isOptional: true, suggestions: ['Ubuntu', 'Debian', 'kali-linux', 'openSUSE-Tumbleweed', 'OracleLinux_9_1', 'Ubuntu-24.04', 'Ubuntu-22.04'] } },
    { name: ['-l', '--list'], description: 'Lists distributions', },
    { name: ['--all'], description: 'List all distributions, including those being installed or uninstalled' },
    { name: ['--running'], description: 'List only distributions that are currently running' },
    { name: ['-q', '--quiet'], description: 'Only show distribution names' },
    { name: ['-v', '--verbose'], description: 'Show detailed information about all distributions' },
    { name: ['-o', '--online'], description: 'Displays a list of available distributions for install' },
    { name: '--set-default', description: 'Sets the distribution as the default', args: { name: 'distro', generators: wslDistros } },
    { name: ['-s'], description: 'Sets the distribution as the default', args: { name: 'distro', generators: wslDistros } },
    { name: '--set-default-version', description: 'Changes the default install version for new distributions', args: { name: 'version', suggestions: ['1', '2'] } },
    { name: '--set-version', description: 'Changes the version of the specified distribution', args: [{ name: 'distro', generators: wslDistros }, { name: 'version', suggestions: ['1', '2'] }] },
    { name: '--shutdown', description: 'Immediately terminates all running distributions and the WSL 2 VM' },
    { name: ['-t', '--terminate'], description: 'Terminates the specified distribution', args: { name: 'distro', generators: wslDistros } },
    { name: '--unregister', description: 'Unregisters the distribution and deletes the root filesystem', args: { name: 'distro', generators: wslDistros }, isDangerous: true },
    { name: '--export', description: 'Exports the distribution to a tar file', args: [{ name: 'distro', generators: wslDistros }, { name: 'file', template: 'filepaths' }] },
    { name: '--import', description: 'Imports the specified tar file as a new distribution', args: [{ name: 'distro' }, { name: 'location', template: 'folders' }, { name: 'file', template: 'filepaths' }] },
    { name: '--mount', description: 'Attaches and mounts a physical or virtual disk', args: { name: 'disk' } },
    { name: '--unmount', description: 'Unmounts and detaches a disk', args: { name: 'disk', isOptional: true } },
    { name: '--status', description: 'Show the status of Windows Subsystem for Linux' },
    { name: '--update', description: 'Update the Windows Subsystem for Linux package' },
    { name: '--version', description: 'Display version information' },
    { name: '--help', description: 'Display usage information' }
  ],
  args: { name: 'command', isOptional: true, isCommand: true }
}

const ipconfig: Fig.Spec = {
  name: 'ipconfig',
  description: 'Displays all current TCP/IP network configuration values',
  options: [
    { name: '/all', description: 'Display full configuration information' },
    { name: '/release', description: 'Release the IPv4 address for the specified adapter', args: { name: 'adapter', isOptional: true } },
    { name: '/release6', description: 'Release the IPv6 address for the specified adapter', args: { name: 'adapter', isOptional: true } },
    { name: '/renew', description: 'Renew the IPv4 address for the specified adapter', args: { name: 'adapter', isOptional: true } },
    { name: '/renew6', description: 'Renew the IPv6 address for the specified adapter', args: { name: 'adapter', isOptional: true } },
    { name: '/flushdns', description: 'Purges the DNS Resolver cache' },
    { name: '/registerdns', description: 'Refreshes all DHCP leases and re-registers DNS names' },
    { name: '/displaydns', description: 'Display the contents of the DNS Resolver Cache' },
    { name: '/showclassid', description: 'Displays all the DHCP class IDs allowed for adapter', args: { name: 'adapter' } },
    { name: '/setclassid', description: 'Modifies the DHCP class ID', args: [{ name: 'adapter' }, { name: 'classid', isOptional: true }] },
    { name: '/?', description: 'Display help' }
  ]
}

const ping: Fig.Spec = {
  name: 'ping',
  description: 'Send ICMP ECHO_REQUEST to network hosts',
  args: { name: 'host' },
  options: [
    { name: '-t', description: 'Ping the specified host until stopped (Ctrl+C)' },
    { name: '-a', description: 'Resolve addresses to hostnames' },
    { name: '-n', description: 'Number of echo requests to send', args: { name: 'count', suggestions: ['4', '10', '100'] } },
    { name: '-l', description: 'Send buffer size', args: { name: 'size' } },
    { name: '-f', description: 'Set Do Not Fragment flag in packet (IPv4-only)' },
    { name: '-i', description: 'Time To Live', args: { name: 'TTL' } },
    { name: '-w', description: 'Timeout in milliseconds to wait for each reply', args: { name: 'timeout' } },
    { name: '-S', description: 'Source address to use', args: { name: 'srcaddr' } },
    { name: '-4', description: 'Force using IPv4' },
    { name: '-6', description: 'Force using IPv6' }
  ]
}

const netstat: Fig.Spec = {
  name: 'netstat',
  description: 'Displays protocol statistics and current TCP/IP network connections',
  args: { name: 'interval', isOptional: true },
  options: [
    { name: '-a', description: 'Displays all connections and listening ports' },
    { name: '-b', description: 'Displays the executable involved in creating each connection (admin)' },
    { name: '-e', description: 'Displays Ethernet statistics' },
    { name: '-f', description: 'Displays Fully Qualified Domain Names for foreign addresses' },
    { name: '-n', description: 'Displays addresses and port numbers in numerical form' },
    { name: '-o', description: 'Displays the owning process ID associated with each connection' },
    { name: '-p', description: 'Shows connections for the protocol specified', args: { name: 'proto', suggestions: ['TCP', 'UDP', 'TCPv6', 'UDPv6'] } },
    { name: '-q', description: 'Displays all connections, listening ports, and bound nonlistening TCP ports' },
    { name: '-r', description: 'Displays the routing table' },
    { name: '-s', description: 'Displays per-protocol statistics' },
    { name: '-x', description: 'Displays NetworkDirect connections, listeners, and shared endpoints' },
    { name: '-y', description: 'Displays the TCP connection template for all connections' }
  ]
}

const tasklist: Fig.Spec = {
  name: 'tasklist',
  description: 'Displays a list of currently running processes',
  options: [
    { name: '/S', description: 'Remote system to connect to', args: { name: 'system' } },
    { name: '/U', description: 'User context under which the command should execute', args: { name: 'user' } },
    { name: '/M', description: 'Lists all tasks currently using the given module', args: { name: 'module', isOptional: true } },
    { name: '/SVC', description: 'Displays services hosted in each process' },
    { name: '/APPS', description: 'Displays Store Apps and their associated processes' },
    { name: '/V', description: 'Displays verbose task information' },
    { name: '/FI', description: 'Displays tasks that match the given filter', args: { name: 'filter', suggestions: ['"IMAGENAME eq "', '"PID eq "', '"STATUS eq RUNNING"', '"USERNAME eq "', '"MEMUSAGE gt "'] } },
    { name: '/FO', description: 'Output format', args: { name: 'format', suggestions: ['TABLE', 'LIST', 'CSV'] } },
    { name: '/NH', description: 'Column header should not be displayed' }
  ]
}

const taskkill: Fig.Spec = {
  name: 'taskkill',
  description: 'Ends one or more tasks or processes',
  options: [
    { name: '/PID', description: 'Process ID of the process to be terminated', args: { name: 'pid' }, isRepeatable: true },
    { name: '/IM', description: 'Image name of the process to be terminated', args: { name: 'imagename' }, isRepeatable: true },
    { name: '/F', description: 'Forcefully terminate the process(es)', isDangerous: true },
    { name: '/T', description: 'Terminates the process and any child processes' },
    { name: '/FI', description: 'Applies a filter to select a set of tasks', args: { name: 'filter' } },
    { name: '/S', description: 'Remote system to connect to', args: { name: 'system' } },
    { name: '/U', description: 'User context', args: { name: 'user' } }
  ]
}

const robocopy: Fig.Spec = {
  name: 'robocopy',
  description: 'Robust file copy',
  args: [
    { name: 'source', template: 'folders' },
    { name: 'destination', template: 'folders' },
    { name: 'file', isOptional: true, isVariadic: true, template: 'filepaths' }
  ],
  options: [
    { name: '/S', description: 'Copy subdirectories, but not empty ones' },
    { name: '/E', description: 'Copy subdirectories, including empty ones' },
    { name: '/MIR', description: 'Mirror a directory tree (equivalent to /E plus /PURGE)', isDangerous: true },
    { name: '/PURGE', description: 'Delete destination files/dirs that no longer exist in source', isDangerous: true },
    { name: '/MOV', description: 'Move files (delete from source after copying)' },
    { name: '/MOVE', description: 'Move files and dirs (delete from source after copying)' },
    { name: '/Z', description: 'Copy files in restartable mode' },
    { name: '/B', description: 'Copy files in Backup mode' },
    { name: '/J', description: 'Copy using unbuffered I/O (recommended for large files)' },
    { name: '/MT', description: 'Do multi-threaded copies with n threads (default 8)', requiresSeparator: ':', args: { name: 'n', suggestions: ['8', '16', '32'] } },
    { name: '/COPY', description: 'What to copy for files (default /COPY:DAT)', requiresSeparator: ':', args: { name: 'flags', suggestions: ['DAT', 'DATS', 'DATSOU'] } },
    { name: '/DCOPY', description: 'What to copy for directories (default /DCOPY:DA)', requiresSeparator: ':', args: { name: 'flags', suggestions: ['DA', 'DAT'] } },
    { name: '/XF', description: 'Exclude files matching given names/paths/wildcards', args: { name: 'file', isVariadic: true } },
    { name: '/XD', description: 'Exclude directories matching given names/paths', args: { name: 'dir', isVariadic: true } },
    { name: '/XO', description: 'Exclude older files' },
    { name: '/R', description: 'Number of retries on failed copies (default 1 million)', requiresSeparator: ':', args: { name: 'n', suggestions: ['0', '1', '3'] } },
    { name: '/W', description: 'Wait time between retries in seconds (default 30)', requiresSeparator: ':', args: { name: 'n', suggestions: ['1', '5', '10'] } },
    { name: '/L', description: 'List only - do not copy, timestamp or delete any files' },
    { name: '/NP', description: 'No progress - do not display percentage copied' },
    { name: '/NFL', description: 'No file list - do not log file names' },
    { name: '/NDL', description: 'No directory list - do not log directory names' },
    { name: '/LOG', description: 'Output status to log file (overwrite existing log)', requiresSeparator: ':', args: { name: 'file', template: 'filepaths' } },
    { name: '/TEE', description: 'Output to console window, as well as the log file' },
    { name: '/?', description: 'Display help' }
  ]
}

const shutdown: Fig.Spec = {
  name: 'shutdown',
  description: 'Shut down or restart the computer',
  options: [
    { name: '/s', description: 'Shutdown the computer' },
    { name: '/r', description: 'Full shutdown and restart the computer' },
    { name: '/l', description: 'Log off' },
    { name: '/h', description: 'Hibernate the local computer' },
    { name: '/a', description: 'Abort a system shutdown' },
    { name: '/t', description: 'Time-out period before shutdown in seconds', args: { name: 'seconds', suggestions: ['0', '60', '600'] } },
    { name: '/f', description: 'Force running applications to close without warning' },
    { name: '/g', description: 'Full shutdown and restart, then restart registered applications' },
    { name: '/fw', description: 'Go to the firmware user interface on next boot (combine with /r)' },
    { name: '/o', description: 'Go to the advanced boot options menu (combine with /r)' },
    { name: '/c', description: 'Comment on the reason for the restart or shutdown', args: { name: 'comment' } }
  ]
}

const sfc: Fig.Spec = {
  name: 'sfc',
  description: 'System File Checker',
  options: [
    { name: '/scannow', description: 'Scans integrity of all protected system files and repairs problems' },
    { name: '/verifyonly', description: 'Scans integrity of all protected system files without repair' },
    { name: '/scanfile', description: 'Scans integrity of the referenced file and repairs it', requiresSeparator: '=', args: { name: 'file', template: 'filepaths' } },
    { name: '/verifyfile', description: 'Verifies the integrity of the file without repair', requiresSeparator: '=', args: { name: 'file', template: 'filepaths' } }
  ]
}

const where: Fig.Spec = {
  name: 'where',
  description: 'Displays the location of files that match the search pattern',
  args: { name: 'pattern', isVariadic: true },
  options: [
    { name: '/R', description: 'Recursively searches starting from the specified directory', args: { name: 'dir', template: 'folders' } },
    { name: '/Q', description: 'Returns only the exit code' },
    { name: '/F', description: 'Displays the matched filename in double quotes' },
    { name: '/T', description: 'Displays the file size, last modified date and time' }
  ]
}

/** Windows'ta (hangi kabuk olursa olsun) bu adlar için kullanılan spec'ler. */
export const WINDOWS_SPECS: Record<string, Fig.Spec> = {
  winget,
  choco,
  scoop,
  wsl,
  ipconfig,
  ping,
  netstat,
  tasklist,
  taskkill,
  robocopy,
  shutdown,
  sfc,
  where
}
