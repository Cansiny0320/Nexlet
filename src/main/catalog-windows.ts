import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
export interface WindowsApplication {
  Name: string;
  AppID: string;
  IconPath?: string;
}
export async function readWindowsApplicationSignature(): Promise<string> {
  const script =
    "$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new(); @(Get-StartApps | Select-Object Name,AppID) | ConvertTo-Json -Compress";
  const { stdout } = await exec(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { windowsHide: true, timeout: 20000, maxBuffer: 2 * 1024 * 1024 },
  );
  const result = JSON.parse(stdout || '[]');
  return JSON.stringify(
    (Array.isArray(result) ? result : [result])
      .filter(
        (item) =>
          item &&
          typeof item.Name === 'string' &&
          typeof item.AppID === 'string' &&
          /^[a-zA-Z0-9_.-]+![a-zA-Z0-9_.-]+$/.test(item.AppID),
      )
      .map((item) => [item.AppID, item.Name])
      .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1])),
  );
}
const INDEX_SCRIPT = String.raw`
[Console]::OutputEncoding=[Text.UTF8Encoding]::new()
$apps = @(Get-StartApps | Where-Object { $_.AppID -match '^[a-zA-Z0-9_.-]+![a-zA-Z0-9_.-]+$' })
$needed = @{}
foreach ($entry in $apps) { $needed[$entry.AppID.Split('!')[0]] = $true }
$logos = @{}
try {
  foreach ($package in (Get-AppxPackage -ErrorAction Stop)) {
    if (-not $needed.ContainsKey($package.PackageFamilyName)) { continue }
    try {
      [xml]$manifest = Get-Content -LiteralPath (Join-Path $package.InstallLocation 'AppxManifest.xml') -Raw -ErrorAction Stop
      foreach ($application in $manifest.SelectNodes("//*[local-name()='Applications']/*[local-name()='Application']")) {
        $visual = $application.SelectSingleNode("./*[local-name()='VisualElements']")
        if ($null -eq $visual) { continue }
        $logo = $visual.GetAttribute('Square44x44Logo')
        if (-not $logo) { $logo = $visual.GetAttribute('Square150x150Logo') }
        if (-not $logo) { continue }
        $candidate = [IO.Path]::GetFullPath((Join-Path $package.InstallLocation $logo))
        if (-not $candidate.StartsWith($package.InstallLocation.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { continue }
        if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
          $directory = [IO.Path]::GetDirectoryName($candidate)
          $stem = [IO.Path]::GetFileNameWithoutExtension($candidate)
          $extension = [IO.Path]::GetExtension($candidate)
          $variants = @(Get-ChildItem -LiteralPath $directory -Filter ($stem + '.*' + $extension) -File -ErrorAction SilentlyContinue)
          $best = $variants | Sort-Object @{Expression={
            if ($_.Name -match 'targetsize-(48|64)_altform-unplated') { 0 }
            elseif ($_.Name -match 'targetsize-(48|64)') { 1 }
            elseif ($_.Name -match 'scale-100') { 2 }
            else { 3 }
          }}, Name | Select-Object -First 1
          if ($null -eq $best) { continue }
          $candidate = $best.FullName
        }
        $logos[$package.PackageFamilyName + '!' + $application.GetAttribute('Id')] = $candidate
      }
    } catch { }
  }
} catch { }
@($apps | ForEach-Object { @{Name=$_.Name; AppID=$_.AppID; IconPath=$logos[$_.AppID]} }) | ConvertTo-Json -Compress
`;

export async function readWindowsApplications(): Promise<WindowsApplication[]> {
  const { stdout } = await exec(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', INDEX_SCRIPT],
    { windowsHide: true, timeout: 20000, maxBuffer: 2 * 1024 * 1024 },
  );
  const result = JSON.parse(stdout || '[]');
  return (Array.isArray(result) ? result : [result]).filter(
    (item) =>
      item &&
      typeof item.Name === 'string' &&
      typeof item.AppID === 'string' &&
      /^[a-zA-Z0-9_.-]+![a-zA-Z0-9_.-]+$/.test(item.AppID),
  );
}
