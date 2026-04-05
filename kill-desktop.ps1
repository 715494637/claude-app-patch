Get-Process -Name '*claude*' -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path -notlike '*\.local\bin\*' } | ForEach-Object {
    Write-Host "Killing PID $($_.Id) at $($_.Path)"
    Stop-Process -Id $_.Id -Force
}
Write-Host "Done"
