@echo off
:: Setup Postgres for Piksel local development
:: Run as Administrator: right-click setup-postgres.bat, "Run as administrator"

set PGBIN=C:\Program Files\PostgreSQL\16\bin
set PGDATA=C:\Program Files\PostgreSQL\16\data
set PGHBA=%PGDATA%\pg_hba.conf

echo Stopping PostgreSQL...
sc stop postgresql-x64-16
timeout /t 3 /nobreak >nul

echo Backing up pg_hba.conf...
copy /Y "%PGHBA%" "%PGHBA%.bak" >nul

echo Temporarily switching to trust auth for local connections...
powershell -Command "(Get-Content '%PGHBA%') -replace 'scram-sha-256', 'trust' | Set-Content '%PGHBA%'"

echo Starting PostgreSQL...
sc start postgresql-x64-16
timeout /t 5 /nobreak >nul

echo Setting postgres password and creating piksel database...
"%PGBIN%\psql.exe" -U postgres -c "ALTER USER postgres WITH PASSWORD 'piksel_dev_pw';"
"%PGBIN%\psql.exe" -U postgres -c "CREATE USER piksel WITH PASSWORD 'piksel_dev_pw' SUPERUSER;"
"%PGBIN%\psql.exe" -U postgres -c "CREATE DATABASE piksel OWNER piksel;"
"%PGBIN%\psql.exe" -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE piksel TO piksel;"

echo Restoring pg_hba.conf to scram-sha-256...
copy /Y "%PGHBA%.bak" "%PGHBA%" >nul

echo Restarting PostgreSQL to apply auth change...
sc stop postgresql-x64-16
timeout /t 3 /nobreak >nul
sc start postgresql-x64-16
timeout /t 5 /nobreak >nul

echo.
echo Running schema...
"%PGBIN%\psql.exe" -h localhost -U piksel -d piksel -f "%~dp0schema.sql"

echo.
echo Verifying connection...
"%PGBIN%\psql.exe" -h localhost -U piksel -d piksel -c "SELECT count(*) FROM users;"

echo.
echo Done! Update .env:
echo   DATABASE_URL=postgresql://piksel:piksel_dev_pw@localhost:5432/piksel
echo   DATABASE_SSL=false
echo.
pause
