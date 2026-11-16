const { execFileSync } = require('node:child_process');

exports.default = async ({ path }) => {
  execFileSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', `
    $ErrorActionPreference = 'Stop'
    $options = @{
      Endpoint = 'https://weu.codesigning.azure.net'
      CodeSigningAccountName = 'Ooznest-CodeSigning'
      CertificateProfileName = 'Ooznest-PublicTrustCertificate'
      Files = $env:SIGNING_FILE
      FileDigest = 'SHA256'
      TimestampRfc3161 = 'http://timestamp.acs.microsoft.com'
      TimestampDigest = 'SHA256'
    }
    Invoke-TrustedSigning @options
    $signature = Get-AuthenticodeSignature -LiteralPath $env:SIGNING_FILE
    if ($signature.Status -ne 'Valid' -or !$signature.TimeStamperCertificate) {
      throw "Invalid or missing timestamped signature for $($env:SIGNING_FILE): $($signature.StatusMessage)"
    }
    $publisher = $signature.SignerCertificate.GetNameInfo('SimpleName', $false)
    if ($publisher -cne $env:WINDOWS_SIGNING_PUBLISHER) {
      throw "Signing certificate publisher '$publisher' does not match WINDOWS_SIGNING_PUBLISHER"
    }
  `], {
    env: { ...process.env, SIGNING_FILE: path },
    stdio: 'inherit',
  });
};
