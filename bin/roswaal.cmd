@echo off
rem
rem  Roswaal launcher for Windows.
rem
rem  A .cmd file invoking Node, NOT a compiled executable, and deliberately so:
rem  Smart App Control blocks unsigned binaries it has never seen, so every
rem  rebuild of a packaged roswaal.exe would be blocked afresh. A script that
rem  calls an already-trusted interpreter sidesteps that entirely.
rem
setlocal

rem  Where the tool lives.
pushd "%~dp0.."
set "ROSWAAL_HOME=%CD%"
popd

set "ROSWAAL_ENTRY=%ROSWAAL_HOME%\dist-cli\roswaal.mjs"

if not exist "%ROSWAAL_ENTRY%" (
  echo roswaal: the CLI has not been built yet.
  echo   Run:  npm install ^&^& npm run build
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo roswaal: could not find Node.
  echo   Install Node 20 or newer, or put it on your PATH.
  exit /b 1
)

rem  Node runs *after* this batch file has ended. A goto with no label ends
rem  the batch on the spot, and the rest of the line -- already read, with
rem  every variable in it already expanded -- carries on as a plain command.
rem  So Ctrl+C reaches Node alone, and cmd has no batch job left to ask
rem  "Terminate batch job (Y/N)?" about, or to echo ^C over.
rem
rem  Ending the batch ends its setlocal too, so nothing set above reaches
rem  Node, and nothing leaks into a cmd that called this. Node needs nothing
rem  from here: the working directory is still the user's, and the exit code
rem  is Node's, because it is the last thing that runs.
(goto) 2>nul & node "%ROSWAAL_ENTRY%" %*
