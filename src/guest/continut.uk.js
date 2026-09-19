/* Continutul editorial in ucraineana, tradus si aprobat 19 septembrie 2026.
 * Aceeasi forma (aceleasi chei) ca in continut.ro.js — verificat de
 * continut-forme.test.js. REGULAMENT si ATRACTII_TEXT nu mai sunt aici
 * din Task 7 — traiesc separat, in regulament.<lang>.js si
 * atractii-text.<lang>.js, incarcate lenes din continut-mare.js. */

export const asistentaRaspuns = "відповідає протягом кількох хвилин";

export const BUN_VENIT = {
  intro: "Ми раді, що ви тут, і бажаємо вам приємного відпочинку.",
  puncte: [
    {
      titlu: "Безкоштовний Wi-Fi",
      inainte: "Мережа ",
      dupa: ", без пароля.",
      actiune: "wifi",
    },
    {
      titlu: "Збережіть сторінку на телефоні",
      text: "Код і кнопка відкриття дверей будуть під рукою протягом усього перебування.",
      actiune: "instalare",
    },
  ],
};

export const IMPORTANT = [
  { titlu: "Куріння", text: "Заборонено в номері та в закритих приміщеннях — на вулиці можна. Куріння в номері оплачується штрафом 500 леїв." },
  { titlu: "Тиша", text: "Просимо дотримуватися тиші з 22:00 до 8:00." },
  { titlu: "Тварини", text: "Дозволені, за додаткову плату 50 леїв за перебування." },
  { titlu: "Парковка", text: "Безкоштовна на території, під відповідальність власника автомобіля." },
];

export const ACCES_CAMERE_DESCRIERI = [
  { fisier: "1-intrarea.jpg", descriere: "Заїжджайте через парковку праворуч і рухайтеся за напрямком руху." },
  { fisier: "2-aleea.jpg",    descriere: "Біля цього знаку продовжуйте рух прямо." },
  { fisier: "3-parcarea.jpg", descriere: "Ви приїхали на парковку." },
  { fisier: "4-poteca.jpg",   descriere: "Прохід до номерів — стежкою праворуч, повз Grand'Or Ballroom." },
];
