/** Конфигурация Firebase для совместного режима.
 *  null — совместный режим скрыт. Значения публичные (это не секреты),
 *  доступ к данным ограничивают правила Realtime Database. */
export const firebaseConfig: {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  appId: string;
} | null = {
  apiKey: 'AIzaSyCrEwvWlm4SOuWSSVi_wWUAgfK89uhaFg8',
  authDomain: 'office-planner-bf894.firebaseapp.com',
  databaseURL: 'https://office-planner-bf894-default-rtdb.firebaseio.com',
  projectId: 'office-planner-bf894',
  appId: '1:704593400950:web:d223db298f034ecd747b57',
};
