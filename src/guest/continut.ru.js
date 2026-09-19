/* Continutul editorial in rusa, tradus si aprobat 19 septembrie 2026.
 * Aceeasi forma (aceleasi chei) ca in continut.ro.js — verificat de
 * continut-forme.test.js. REGULAMENT si ATRACTII_TEXT nu mai sunt aici
 * din Task 7 — traiesc separat, in regulament.<lang>.js si
 * atractii-text.<lang>.js, incarcate lenes din continut-mare.js. */

export const asistentaRaspuns = "отвечает в течение нескольких минут";

export const BUN_VENIT = {
  intro: "Мы рады, что вы здесь, и желаем вам приятного отдыха.",
  puncte: [
    {
      titlu: "Бесплатный Wi-Fi",
      inainte: "Сеть ",
      dupa: ", без пароля.",
      actiune: "wifi",
    },
    {
      titlu: "Сохраните страницу на телефоне",
      text: "Код и кнопка открытия двери будут под рукой на протяжении всего пребывания.",
      actiune: "instalare",
    },
  ],
};

export const IMPORTANT = [
  { titlu: "Курение", text: "Запрещено в номере и в закрытых помещениях — на улице можно. Курение в номере облагается штрафом 500 лей." },
  { titlu: "Тишина", text: "Просим соблюдать тишину с 22:00 до 8:00." },
  { titlu: "Животные", text: "Разрешены, за дополнительную плату 50 лей за пребывание." },
  { titlu: "Парковка", text: "Бесплатная на территории, под ответственность владельца автомобиля." },
];

export const ACCES_CAMERE_DESCRIERI = [
  { fisier: "1-intrarea.jpg", descriere: "Въезжайте через парковку справа и следуйте по направлению движения." },
  { fisier: "2-aleea.jpg",    descriere: "У этого знака продолжайте движение прямо." },
  { fisier: "3-parcarea.jpg", descriere: "Вы приехали на парковку." },
  { fisier: "4-poteca.jpg",   descriere: "Проход к номерам — по дорожке справа, мимо Grand'Or Ballroom." },
];
