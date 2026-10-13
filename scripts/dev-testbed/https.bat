@echo off
echo PORTAL PORT UP
tailscale serve --bg --https=5173 http://127.0.0.1:5173
echo CL PORT UP
tailscale serve --bg --https=5174 http://127.0.0.1:5174
tailscale serve status