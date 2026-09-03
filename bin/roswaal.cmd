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

rem  Where the user actually is, and where the tool lives. The CLI reads
rem  ROSWAAL_CWD rather than trusting the process working directory.
set "ROSWAAL_CWD=%CD%"
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

node "%ROSWAAL_ENTRY%" %*
rem  Capture the exit code before anything else can clobber ERRORLEVEL.
set "ROSWAAL_EXIT=%ERRORLEVEL%"
exit /b %ROSWAAL_EXIT%
