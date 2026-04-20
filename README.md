# Finix Printing Forms

A lightweight form builder and student response collector for Finix Printing.

## What it does

- Shows a branded homepage for Finix Printing with booking and social media links
- Includes an admin dashboard to create shareable forms
- Lets students fill forms through a separate public link
- Stores responses in SQLite
- Exports responses as an Excel-compatible `.xls` file

## Run locally

```bash
npm start
```

Open `http://localhost:3000`.

## Edit shop details

Update contact and social media details in [data/site-config.json](/D:/form_collector/data/site-config.json).

## Deployment note

This app uses SQLite, so deploy it on a server or hosting provider that gives you persistent disk storage. You can also set a custom database path with the `DATABASE_FILE` environment variable.
