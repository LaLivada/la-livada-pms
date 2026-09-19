export default {
  pasi: {
    perioada: "Период",
    camerele: "Номера",
    datele: "Ваши данные",
    gata: "Готово",
  },

  cuvinte: {
    noapte: { one: "ночь", few: "ночи", many: "ночей", other: "ночи" },
    adult: { one: "взрослый", few: "взрослых", many: "взрослых", other: "взрослого" },
    copil: { one: "ребёнок", few: "ребёнка", many: "детей", other: "ребёнка" },
    camera: { one: "номер", few: "номера", many: "номеров", other: "номера" },
    persoana: { one: "человек", few: "человека", many: "человек", other: "человека" },
    minut: { one: "минута", few: "минуты", many: "минут", other: "минуты" },
  },

  tipCamera: {
    mixt: "Смешанные номера",
  },

  cautare: {
    titlu: "Проверить наличие",
    subtitluPerioada: "{{nopti}} {{cuvantNopti}} · заезд с 14:00, выезд до 11:00",
    subtitluGol: "Выберите даты проживания",
    nopti: "Ночей",
    adulti: "Взрослые",
    copii: "Дети",
    verificand: "Проверяем наличие…",
    cautaCamere: "Найти номера",
  },

  schelet: {
    incarcaRezervare: "Загружаем бронирование…",
    verificaDisponibilitate: "Проверяем наличие…",
  },

  rezultate: {
    titlu: "Доступные номера",
    subtitlu: "{{sosire}} → {{plecare}} · {{adulti}} {{cuvantAdulti}}",
    subtitluCuCopii: "{{sosire}} → {{plecare}} · {{adulti}} {{cuvantAdulti}} · {{copii}} {{cuvantCopii}}",
    nimicLiber: "На выбранный период свободных номеров нет.",
    nimicLiberSfat: "Попробуйте другие даты или позвоните нам — возможно, найдём решение.",
    persoane: "{{n}} {{cuvantPersoane}}",
    totalPerioada: "{{n}} {{cuvantNopti}}, итого",
    totalEstimat: "Ориентировочная сумма",
    alegeVarianta: "Выбрать вариант",
    continua: "Продолжить",
    fotografii: "Фотографии",
  },

  date: {
    titlu: "Ваши данные",
    subtitlu: "Мы отправим вам подтверждение и свяжемся только по поводу бронирования.",
    perioada: "Период",
    nume: "Фамилия",
    prenume: "Имя",
    telefon: "Телефон",
    prefixInternational: "Международный код",
    altPrefix: "Другой код…",
    prefixulTarii: "Код страны",
    numarulDeTelefon: "Номер телефона",
    email: "Email",
    emailPlaceholder: "для подтверждения бронирования",
    localitate: "Город",
    judet: "Уезд (жудец)",
    tara: "Страна",
    obligatoriiCuJudet: "Все поля выше обязательны для заполнения.",
    obligatoriiFaraJudet: "Все поля выше обязательны для заполнения, кроме уезда.",
    cerinteSpeciale: "Особые пожелания",
    cerinteSpecialePlaceholder: "напр. заезд после 22:00, дополнительная кровать",
    inapoi: "Назад",
    trimite: "Отправить бронирование",
    seTrimite: "Отправка…",
  },

  firma: {
    bifa: "Выставить счёт на компанию",
    denumire: "Название компании",
    cui: "ИНН/VAT",
    cuiPlaceholder: "напр. RO12345678",
    regCom: "Номер в торговом реестре (необязательно)",
    regComPlaceholder: "напр. J1/23/2020",
    adresa: "Юридический адрес",
    oras: "Город",
    judet: "Уезд (жудец)",
  },

  plata: {
    card: "Оплатить картой",
    cardDescriere: "Безопасно, через NETOPIA. Вы сразу перейдёте к оплате.",
    cash: "наличными при заезде",
    transfer: "банковский перевод",
  },

  confirmare: {
    titluAnulata: "Бронирование отменено",
    titluMaiEUnPas: "Ещё один шаг",
    titluExpirata: "Бронирование не было подтверждено вовремя",
    titluInregistrata: "Бронирование зарегистрировано",
    noteazaNumarul: "Запишите номер — он понадобится, когда вы позвоните нам.",
    peNumele: "На имя",
    perioada: "Период",
    camere: "Номера",
    total: "Итого",

    anulataMesaj: "Номера были освобождены. Если это ошибка, позвоните нам — мы проверим, доступны ли они ещё.",
    anulataRambursare: "Сумма {{suma}} будет возвращена на использованную карту — это делается вручную, в течение нескольких рабочих дней.",

    cardEsuatTitlu: "Оплата картой не прошла.",
    cardEsuatDetalii: "Банк не подтвердил платёж — списания не было. Мы удерживаем номера ещё {{minute}}, так что вы можете попробовать снова, той же картой или другой.",
    incearcaPlataDinNou: "Повторить оплату",
    sePregatestePlata: "Готовим оплату…",

    verificamPlataTitlu: "Проверяем оплату через NETOPIA.",
    verificamPlataDetalii: "Если вы вернулись со страницы оплаты, подтверждение может занять несколько секунд. Обновите страницу, если она не обновится сама.",

    emailTrimisTitlu: "Мы отправили письмо на {{email}}.",
    adresaData: "указанный адрес",
    emailTrimisDetalii: "Нажмите на кнопку в письме, чтобы бронирование стало окончательным. Мы удерживаем номера ещё {{minute}}; если вы не подтвердите, они освободятся автоматически, и вы сможете повторить поиск в любой момент. Проверьте также папку «Спам».",

    expirataMesaj: "Подтверждение пришло слишком поздно, и номера были освобождены. Списания не было — выполните поиск на нужные даты ещё раз или позвоните нам, и мы оформим бронирование на месте.",

    cardConfirmatTitlu: "Мы получили оплату — бронирование подтверждено.",
    cardConfirmatDetalii: "Мы также отправили вам письмо с подтверждением. Ждём вас!",

    implicitMesaj: "Мы свяжемся с вами по телефону для подтверждения. Оплата производится при заезде.",

    sigurAnulezi: "Вы уверены, что хотите отменить бронирование?",
    anulareDetaliiInainte: "Номера освобождаются немедленно и могут стать недоступны, если вы передумаете. Согласно ",
    politiciiDeAnulare: "правилам отмены",
    anulareDetaliiDupa: ", полная стоимость первой ночи удерживается.",
    pastrezRezervarea: "Нет, оставить бронирование",
    seAnuleaza: "Отменяем…",
    daAnuleaza: "Да, отменить",
    anuleazaRezervarea: "Отменить бронирование",

    linkRevedereInainte: "Вы можете просмотреть или отменить бронирование в любое время по ",
    acestLink: "этой ссылке",
    linkRevedereDupa: " — сохраните её. Мы также отправили её вам на email.",
  },

  countdown: {
    putin: "совсем немного",
    unMinut: "ещё одну минуту",
    inca: "ещё {{m}} {{cuvant}}",
  },

  eroare: {
    camaraOcupata: "Тем временем номер был забронирован кем-то другим. Мы обновили информацию о наличии — выберите заново или измените даты.",
    reluarePlataImposibila: "Мы не можем возобновить оплату с этой страницы (вы открыли её в другой вкладке или на другом устройстве). Позвоните нам, и мы решим это сразу.",
    rezervareaNuAFostGasita: "Бронирование не найдено.",
  },

  landing: {
    titlu: "Проживание в Tiny Houses",
    lede: "Комплекс LA LIVADA - Васлуй",
    galerieLabel: "Галерея",
    galerieTitlu: "Дома, аллея и номера",
  },

  antet: {
    ariaMarca: "Бронирование La Livada — главная страница",
    ariaAlegeLimba: "Выбрать язык",
    ariaDeschideMeniul: "Открыть меню",
    ariaPrincipal: "Главное",
    ariaTotSitul: "Весь сайт",
    nav: { sali: "Залы", nunti: "Свадьбы", experienta: "Впечатления", galerie: "Галерея", contact: "Контакты" },
    cta: "Проверить наличие",
    grup1: { nume: "Главная", kicker: "Проживание в La Livada" },
    grup2: { nume: "Залы", kicker: "Четыре зала", toate: "Все залы" },
    grup3: {
      nume: "Мероприятия", kicker: "Что мы здесь празднуем",
      nunti: "Свадьбы", cununii: "Выездная регистрация брака", botezuri: "Крестины", corporate: "Корпоративные мероприятия",
    },
    grup4: {
      nume: "Впечатления", kicker: "Как проходит день",
      experienta: "Опыт La Livada", meniu: "Меню и предложение", cazare: "Проживание", nuntaProba: "Пробная свадьба",
    },
    grup5: { nume: "Галерея", kicker: "Как это выглядит на самом деле" },
  },

  subsol: {
    seo: "Проживание в Васлуе, во дворе Комплекса La Livada: 16 объектов — два лофта и "
      + "четырнадцать номеров в домах типа tiny house, каждый с собственной ванной комнатой, "
      + "кондиционером и террасой. Мы находимся на трассе DN24, в Мунтений-де-Жос, в нескольких "
      + "минутах от въезда в Васлуй — жильё подходит как для гостей мероприятий, так и для отдыха "
      + "на выходных или деловой поездки в Васлуйский уезд. Бронирование оформляется напрямую "
      + "здесь, без посредников.",
    col1: { titlu: "Залы" },
    col2: {
      titlu: "Мероприятия",
      nunti: "Свадьбы", botezuri: "Крестины", cununii: "Выездная регистрация брака", corporate: "Корпоративные мероприятия",
    },
    col3: { titlu: "Подробнее", meniu: "Меню и предложение", cazare: "Проживание", nuntaProba: "Пробная свадьба", galerie: "Галерея" },
    col4: { titlu: "Контакты" },
    adresa: "DN24, № 743, Мунтений-де-Жос, Васлуйский уезд",
    legal: {
      termeni: "Условия использования", livrare: "Политика доставки", anulare: "Политика отмены",
      retragere: "Отказ от договора", confidentialitate: "Конфиденциальность", cookies: "Cookies",
    },
  },

  calendar: {
    lunaAnterioara: "Предыдущий месяц",
    lunaUrmatoare: "Следующий месяц",
    alegeZiuaPlecarii: "Теперь выберите день выезда.",
    apasaPentruAltaPerioada: "Нажмите на день, чтобы выбрать другой период.",
    apasaSosireaApoiPlecarea: "Нажмите на день заезда, затем на день выезда.",
  },
};
