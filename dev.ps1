# Run from any directory. Keep SDK/JDK settings local to the child process.
# Pass one ASCII argument so Windows PowerShell 5 preserves quotes in CSS selectors.
$json = ConvertTo-Json -InputObject @($args) -Compress
$payload = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
$python = Get-Command py.exe -ErrorAction SilentlyContinue
if ($python) {
    & $python.Source -3 "$PSScriptRoot/tools/workshop.py" --powershell-args $payload
} else {
    & python "$PSScriptRoot/tools/workshop.py" --powershell-args $payload
}
exit $LASTEXITCODE
