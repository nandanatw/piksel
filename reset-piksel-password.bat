@echo off
:: Reset piksel user password to 123456
:: Run as Administrator

set PGBIN=C:\Program Files\PostgreSQL\16\bin
set PGDATA=C:\Program Files\PostgreSQL\16\data
set PGHBA=%PGDATA%\pg_hba.conf

echo Stopping PostgreSQL...
sc stop postgresql-x64-16
timeout /t 3 /nobreak >nul

echo Backing up pg_hba.conf...
if not exist "%PGHBA%.bak" copy /Y "%PGHBA%" "%PGHBA%.bak" >nul

echo Switching to trust auth for local...
powershell -Command "(Get-Content '%PGHBA%') -replace 'scram-sha-256', 'trust' | Set-Content '%PGHBA%'"

echo Starting PostgreSQL...
sc start postgresql-x64-16
timeout /t 5 /nobreak >nul

echo Resetting piksel password to 123456...
"%PGBIN%\psql.exe" -U postgres -c "ALTER USER piksel WITH PASSWORD '123456' SUPERUSER;"
"%PGBIN%\psql.exe" -U postgres -c "ALTER USER postgres WITH PASSWORD 'piksel_dev_pw';"

echo Restoring pg_hba.conf to scram-sha-256...
copy /Y "%PGHBA%.bak" "%PGHBA%" >nul

echo Restarting PostgreSQL...
sc stop postgresql-x64-16
timeout /t 3 /nobreak >nul
sc start postgresql-x64-16
timeout /t 5 /nobreak >nul

echo Verifying...
"%PGBIN%\psql.exe" -h localhost -U piksel -d postgres -c "SELECT current_user;"

echo.
echo Done! Test: psql -h localhost -U piksel -d piksel
echo Password: 123456
echo.
pause
