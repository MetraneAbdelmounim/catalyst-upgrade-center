@echo off
echo ============================================
echo   NETUPGRADE - Build ^& Deploy
echo   UM6P Cisco Switch Upgrade Manager
echo ============================================
echo.

REM Step 1: Build Angular frontend
echo [1/3] Building Angular frontend...
cd frontend
call ng build --configuration production
if %ERRORLEVEL% neq 0 (
    echo ERROR: Angular build failed!
    pause
    exit /b 1
)
cd ..

REM Step 2: Copy build output to backend/static
echo [2/3] Copying frontend build to backend/static...
if exist backend\static rmdir /s /q backend\static
xcopy /E /I /Y frontend\dist\cisco-upgrade-frontend backend\static
echo    Done.

REM Step 3: Docker build and start
echo [3/3] Building and starting Docker containers...
docker-compose down
docker-compose build --no-cache
docker-compose up -d

echo.
echo ============================================
echo   NETUPGRADE is running!
echo   https://localhost:8444
echo ============================================
echo.
echo   Services:
echo     - Nginx (HTTPS)  : https://localhost:8444
echo     - Flask API       : http://localhost:5000 (internal)
echo     - MongoDB         : localhost:27017
echo.
echo   Commands:
echo     docker-compose logs -f        View logs
echo     docker-compose down            Stop all
echo     docker-compose restart app     Restart backend
echo.
pause
