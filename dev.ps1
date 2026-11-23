# Run from any directory. Keep SDK/JDK settings local to the child process.
$python = Get-Command py.exe -ErrorAction SilentlyContinue
if ($python) {
    & $python.Source -3 "$PSScriptRoot/tools/workshop.py" @args
} else {
    & python "$PSScriptRoot/tools/workshop.py" @args
}
exit $LASTEXITCODE
