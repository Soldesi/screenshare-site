@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo       SCREENSHARE - INSTALAR E RODAR
echo ==========================================
echo.

echo [1/3] Instalando dependencias principais...
npm install
if errorlevel 1 goto :erro

echo.
echo [2/3] Instalando dependencias do frontend...
npm --prefix client install
if errorlevel 1 goto :erro

echo.
echo [3/3] Instalando dependencias do servidor...
npm --prefix server install
if errorlevel 1 goto :erro

echo.
echo Tudo certo. Iniciando o projeto...
echo Abra http://localhost:5173 no navegador.
echo.
npm run dev
exit /b 0

:erro
echo.
echo Houve um erro durante a instalacao.
pause
exit /b 1
