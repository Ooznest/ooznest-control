# Ooznest Control

[![Cross-Platform Builds](https://github.com/ooznest/ooznest-control/actions/workflows/cross-platform-builds.yml/badge.svg)](https://github.com/ooznest/ooznest-control/actions/workflows/cross-platform-builds.yml)
[![GitHub Pages](https://github.com/ooznest/ooznest-control/actions/workflows/pages/pages-build-deployment/badge.svg)](https://github.com/ooznest/ooznest-control/actions/workflows/pages/pages-build-deployment)

A modern, cross platform user interface for grblHAL CNC controllers. It connects natively over WebSerial or WebSockets and is designed to be lightweight, fast, and highly portable.

## Downloads

* [Download Latest Release binaries (Windows, macOS, Linux, Android, iOS)](https://github.com/ooznest/ooznest-control/releases/latest)
* [Run pure Web Version (Live GitHub Pages)](https://ooznest.github.io/ooznest-control/)

## Features

* **Universal Compatibility**: Runs directly in recent web browsers using WebSerial API. No local middleware or drivers needed for the web version.
* **Native Binaries**: Standalone executables available for Windows, macOS, and Linux built on Electron, plus mobile apps for Android and iOS using Cordova.
* **3D Viewer**: OpenGL hardware accelerated G-code viewer with orbiting, panning, zooming, and dynamic machine/job box bounding views.
* **SD Card Management**: Built in terminal for viewing, uploading, and executing large jobs directly off the controller SD card without USB streaming delays.
* **Live Workspace Elements**: Fully responsive Digital Read Out (DRO) supporting complex multi axis machines, displaying real time coordinates, feeds, speeds, and machine state.
* **Integrated G-Code Editor**: Edit, download, and sync your programs on the fly directly inside the application.
* **Wizards & Utilities**: Out of the box support for custom macros, xyz touch plate probing sequences, and a specialized surface-facing automated code generator.
