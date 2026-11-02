# Mobile apps

iPhone and Android apps, built with React Native and Expo.

```
mobile/
├── shared/     # components and native adapters used by every mobile app
└── <app>/      # one Expo project per product, named after apps/<app>
```

## Rules

- Screens live here and nowhere else. Mobile code never imports from `apps/<app>/frontend`, and web code never imports from `mobile/`.
- Logic used by both web and mobile (API calls, data types, auth) lives in a shared package outside this directory, never in a mobile app.
- Nothing under `mobile/` triggers a web deploy. Deploy paths only cover `apps/<app>/` and `packages/`, so a deployed app must not depend on code here: changing it wouldn't redeploy that app.
