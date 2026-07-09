import React, { useMemo, useState } from "react";

const cx = (...c) => c.filter(Boolean).join(" ");

const IMG = {
  hero: "https://images.unsplash.com/photo-1523978591478-c753949ff840?auto=format&fit=crop&w=2400&q=80",
  heroOverlay: "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=2400&q=80",
  brideCar: "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?auto=format&fit=crop&w=1400&q=80",
  vintageCar: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1400&q=80",
  couple: "https://images.unsplash.com/photo-1523438097201-512ae7d59e6f?auto=format&fit=crop&w=1400&q=80",
  couple2: "https://images.unsplash.com/photo-1520857014576-2c4f4c972b57?auto=format&fit=crop&w=1400&q=80",
  testimonialBg: "https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=2200&q=80",
  prom: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1400&q=80",
  airport: "https://images.unsplash.com/photo-1529070538774-1843cb3265df?auto=format&fit=crop&w=1400&q=80",
  funerals: "https://images.unsplash.com/photo-1520962922320-2038eebab146?auto=format&fit=crop&w=1400&q=80",
  tailored: "https://images.unsplash.com/photo-1523438097201-512ae7d59e6f?auto=format&fit=crop&w=1400&q=80",
  serviceComfort: "https://images.unsplash.com/photo-1525609004556-c46c7d6cf023?auto=format&fit=crop&w=1400&q=80",
  bookingUi: "https://images.unsplash.com/photo-1551281044-8b89a48b0a67?auto=format&fit=crop&w=1200&q=80"
};

function Icon({ type }) {
  const cls = "w-[18px] h-[18px]";
  switch (type) {
    case "spark":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 2l1.2 6.3L20 12l-6.8 3.7L12 22l-1.2-6.3L4 12l6.8-3.7L12 2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      );
    case "shield":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 2l8 4v6c0 6-3.7 9.7-8 10-4.3-.3-8-4-8-10V6l8-4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      );
    case "clock":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20z" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "car":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 13l2-6h14l2 6v6h-2a2 2 0 0 1-4 0H9a2 2 0 0 1-4 0H3v-6z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M5 13h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "pin":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 22s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case "phone":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6.5 3h3l1 5-2 1c1.2 2.6 3.3 4.7 5.9 5.9l1-2 5 1v3c0 1.1-.9 2-2 2C10 20 4 14 4 6c0-1.1.9-2 2.5-3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      );
    default:
      return null;
  }
}

function Stars({ value = 5 }) {
  return (
    <div className="flex items-center gap-[2px]">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} className="w-3 h-3" viewBox="0 0 24 24" fill={i < value ? "currentColor" : "none"} aria-hidden="true">
          <path d="M12 2l3.1 6.6 7.2 1-5.2 5.1 1.2 7.1L12 18.8 5.7 21.9 6.9 14.8 1.7 9.6l7.2-1L12 2z" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      ))}
    </div>
  );
}

function TopBar() {
  return (
    <div className="bg-brandMustard text-black/80 text-xs">
      <div className="container-max flex items-center justify-between py-2">
        <div className="flex items-center gap-3">
          <span className="font-medium">Welcome to Wedding Cars Hire</span>
          <span className="hidden sm:inline text-black/40">|</span>
          <span className="hidden sm:inline">Luxury • Vintage • Chauffeur</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden md:inline">Call: +675 7000 0000</span>
          <span className="text-black/40">•</span>
          <a href="#booking" className="font-semibold hover:underline">GET A QUOTE</a>
        </div>
      </div>
    </div>
  );
}

function Nav() {
  return (
    <header className="bg-white/85 backdrop-blur border-b border-black/5 sticky top-0 z-40">
      <div className="container-max flex items-center justify-between py-3">
        <nav className="hidden md:flex items-center gap-5 text-sm text-black/60">
          <a href="#fleet" className="hover:text-black">Fleet</a>
          <a href="#services" className="hover:text-black">Services</a>
          <a href="#about" className="hover:text-black">About</a>
        </nav>

        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#efe8dc] ring-1 ring-black/5 shadow-soft">
            <span className="font-serif text-lg text-brandDark">WC</span>
          </div>
          <div className="leading-tight">
            <div className="font-serif text-lg text-brandDark">Wedding Cars</div>
            <div className="eyebrow text-black/45">PREMIUM HIRE</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a href="#booking" className="btn btn-dark hidden sm:inline-flex">Book Now</a>
          <a href="#fleet" className="btn bg-white border border-black/10 text-brandDark hover:bg-black/5">View Cars</a>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative">
      <div className="relative h-[520px] md:h-[560px] overflow-hidden">
        <img src={IMG.hero} alt="" className="absolute inset-0 h-full w-full object-cover grayscale-[35%]" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/45 to-pageBg" />

        <div className="relative container-max h-full flex flex-col justify-center">
          <div className="max-w-[720px]">
            <div className="text-white/70 text-sm">From timeless elegance to modern luxury</div>
            <h1 className="mt-2 font-serif text-4xl md:text-5xl text-white">
              Wedding Cars for Hire
            </h1>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <a href="#booking" className="btn btn-gold">Get a Quote</a>
              <a href="#fleet" className="btn bg-white/10 border border-white/20 text-white hover:bg-white/15">View Fleet</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Fleet({ cars }) {
  return (
    <section id="fleet" className="py-10 md:py-12">
      <div className="container-max">
        <div className="text-center">
          <div className="eyebrow text-black/50">Our Fleet</div>
          <h2 className="mt-2 font-serif text-2xl md:text-3xl text-brandDark">
            Discover exclusive collection of wedding cars
          </h2>
        </div>

        <div className="mt-8 grid gap-5 md:gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cars.map((c) => (
            <article key={c.name} className="card overflow-hidden">
              <div className="relative h-40">
                <img src={c.image} alt={c.name} className="h-full w-full object-cover" loading="lazy" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/15 via-black/0 to-black/0" />
              </div>

              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div className="text-[12px] text-black/55 flex items-center gap-2">
                    <Stars value={c.stars} />
                    <span className="hidden sm:inline">{c.reviews} Reviews</span>
                  </div>
                  <div className="text-[12px] text-black/50 flex items-center gap-1">
                    <Icon type="pin" />
                    <span>{c.location}</span>
                  </div>
                </div>

                <h3 className="mt-2 font-serif text-[18px] leading-tight text-brandDark">{c.name}</h3>
                <p className="mt-1 text-[12px] text-black/55 leading-relaxed">{c.desc}</p>

                <div className="mt-3 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] text-black/45">From</div>
                    <div className="text-brandDark font-semibold">{c.price}</div>
                  </div>
                  <a href="#booking" className="rounded-full bg-brandDark px-4 py-2 text-[12px] font-semibold text-white hover:bg-black">
                    Enquire
                  </a>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-black/55">
                  <div className="rounded-xl bg-[#f6f3ef] px-2 py-2 text-center">
                    <div className="font-semibold text-brandDark">{c.seats}</div>
                    Seats
                  </div>
                  <div className="rounded-xl bg-[#f6f3ef] px-2 py-2 text-center">
                    <div className="font-semibold text-brandDark">{c.doors}</div>
                    Doors
                  </div>
                  <div className="rounded-xl bg-[#f6f3ef] px-2 py-2 text-center">
                    <div className="font-semibold text-brandDark">{c.class}</div>
                    Class
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-8 flex justify-center">
          <a href="#booking" className="btn btn-gold">Get a package price</a>
        </div>
      </div>
    </section>
  );
}

function ComfortSplit() {
  const items = [
    { icon: "spark", title: "Premium cleanliness", sub: "Prepared for photos and comfort." },
    { icon: "clock", title: "Punctual service", sub: "We arrive early and plan routes." },
    { icon: "shield", title: "Trusted chauffeurs", sub: "Calm, professional, wedding-experienced." },
    { icon: "car", title: "Curated vehicles", sub: "Luxury & vintage statement fleet." }
  ];

  return (
    <section className="bg-brandDark">
      <div className="container-max py-12 md:py-14 grid md:grid-cols-2 gap-8 items-center">
        <div>
          <h3 className="font-serif text-2xl md:text-3xl text-white leading-tight">
            We make sure that your every trip is comfortable
          </h3>

          <div className="mt-6 grid grid-cols-2 gap-3">
            {items.map((it) => (
              <div key={it.title} className="rounded-xl bg-white/5 border border-white/10 p-3">
                <div className="flex items-center gap-2 text-white">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-brandGold">
                    <Icon type={it.icon} />
                  </span>
                  <div className="text-sm font-semibold">{it.title}</div>
                </div>
                <div className="mt-2 text-[12px] text-white/70 leading-relaxed">{it.sub}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="rounded-2xl overflow-hidden shadow-soft ring-1 ring-white/10">
            <img src={IMG.brideCar} alt="" className="h-[340px] md:h-[380px] w-full object-cover" loading="lazy" />
          </div>
        </div>
      </div>
    </section>
  );
}

function AboutSpecialists() {
  return (
    <section id="about" className="py-12 md:py-14">
      <div className="container-max grid md:grid-cols-2 gap-10 items-center">
        <div className="relative">
          <div className="rounded-2xl overflow-hidden shadow-soft ring-1 ring-black/5">
            <img src={IMG.vintageCar} alt="" className="h-[330px] w-full object-cover" loading="lazy" />
          </div>
          <div className="hidden md:block absolute -bottom-10 left-6 w-[62%] rounded-2xl overflow-hidden shadow-soft ring-1 ring-black/5">
            <img src={IMG.couple} alt="" className="h-[210px] w-full object-cover" loading="lazy" />
          </div>
        </div>

        <div>
          <div className="eyebrow text-black/50">About us</div>
          <h3 className="mt-2 font-serif text-2xl md:text-3xl text-brandDark leading-tight">
            We are Luxury & Vintage Wedding Car Hire Specialists
          </h3>
          <p className="mt-4 text-sm text-black/60 leading-relaxed">
            Our wedding hire service is built around calm coordination. We help you plan arrival timing,
            photo stops, transfers and bridal exits—so the whole day flows smoothly.
          </p>

          <ul className="mt-5 space-y-2 text-sm text-black/65">
            <li className="flex gap-2"><span className="mt-[3px] h-2 w-2 rounded-full bg-brandGold" /> Chauffeur-driven premium experience</li>
            <li className="flex gap-2"><span className="mt-[3px] h-2 w-2 rounded-full bg-brandGold" /> Flexible half-day and full-day packages</li>
            <li className="flex gap-2"><span className="mt-[3px] h-2 w-2 rounded-full bg-brandGold" /> Photo-ready positioning and door service</li>
          </ul>

          <div className="mt-7">
            <a href="#booking" className="btn btn-gold">Book Now</a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Testimonials() {
  const items = useMemo(() => ([
    { name: "Mila & Joshua", quote: "The car arrived early, spotless, and the chauffeur helped us position perfectly for photos. Everything felt effortless." },
    { name: "Selina & Mark", quote: "We had multiple stops and the team handled timing changes smoothly. Luxury service from start to finish." },
    { name: "Angela & Peter", quote: "The vehicle looked incredible and the ride was calm. Our bridal exit photos were perfect." }
  ]), []);
  const [idx, setIdx] = useState(1);

  return (
    <section id="testimonials" className="py-12 md:py-14">
      <div className="container-max">
        <div className="relative rounded-2xl overflow-hidden ring-1 ring-black/10">
          <img src={IMG.testimonialBg} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40 grayscale-[25%]" />
          <div className="absolute inset-0 bg-black/55" />

          <div className="relative p-8 md:p-10 text-center text-white">
            <div className="eyebrow text-white/70">Testimonials</div>
            <div className="mt-2 font-serif text-3xl">TESTIMONIALS</div>

            <p className="mt-5 mx-auto max-w-3xl text-white/85 leading-relaxed">
              “{items[idx].quote}”
            </p>

            <div className="mt-5 text-sm text-white/80">
              <span className="font-semibold text-white">{items[idx].name}</span>
            </div>

            <div className="mt-7 flex items-center justify-center gap-4">
              <button
                className="grid h-10 w-10 place-items-center rounded-full bg-white/10 border border-white/20 hover:bg-white/15"
                onClick={() => setIdx((p) => (p - 1 + items.length) % items.length)}
                aria-label="Previous"
              >
                ‹
              </button>
              <button
                className="grid h-10 w-10 place-items-center rounded-full bg-white/10 border border-white/20 hover:bg-white/15"
                onClick={() => setIdx((p) => (p + 1) % items.length)}
                aria-label="Next"
              >
                ›
              </button>
            </div>

            <div className="mt-6 flex justify-center gap-2">
              {items.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIdx(i)}
                  className={cx("h-2 w-2 rounded-full", i === idx ? "bg-brandGold" : "bg-white/30 hover:bg-white/45")}
                  aria-label={`Go to ${i+1}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ServiceCards() {
  const cards = [
    { title: "Prom Night", img: IMG.prom },
    { title: "Airport Transfer", img: IMG.airport },
    { title: "Funerals", img: IMG.funerals }
  ];
  return (
    <section id="services" className="py-6 md:py-10">
      <div className="container-max">
        <div className="text-center">
          <h3 className="font-serif text-2xl md:text-3xl text-brandDark">We're here for your every need</h3>
        </div>

        <div className="mt-7 grid md:grid-cols-3 gap-5">
          {cards.map((c) => (
            <div key={c.title} className="card overflow-hidden">
              <div className="relative h-44">
                <img src={c.img} alt="" className="h-full w-full object-cover" loading="lazy" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/20 to-black/0" />
                <div className="absolute bottom-4 left-4 font-serif text-xl text-white">{c.title}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-7 flex justify-center">
          <a href="#booking" className="btn btn-gold">Get Service</a>
        </div>
      </div>
    </section>
  );
}

function Alternating() {
  return (
    <section className="py-10 md:py-12">
      <div className="container-max space-y-10">
        <div className="grid md:grid-cols-2 gap-8 items-center">
          <div>
            <h3 className="font-serif text-2xl md:text-3xl">A Fleet Tailored for Your Perfect Day</h3>
            <p className="mt-3 text-sm text-black/60 leading-relaxed">
              Select a vehicle that matches your theme—modern luxury, vintage charm, or statement performance. We help plan the timing so arrivals and photo stops stay smooth.
            </p>
            <div className="mt-5">
              <a href="#booking" className="btn btn-dark">Book Your Car</a>
            </div>
          </div>
          <div className="rounded-2xl overflow-hidden shadow-soft ring-1 ring-black/5">
            <img src={IMG.tailored} alt="" className="h-[280px] w-full object-cover" loading="lazy" />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8 items-center">
          <div className="order-2 md:order-1 rounded-2xl overflow-hidden shadow-soft ring-1 ring-black/5">
            <img src={IMG.serviceComfort} alt="" className="h-[280px] w-full object-cover" loading="lazy" />
          </div>
          <div className="order-1 md:order-2">
            <h3 className="font-serif text-2xl md:text-3xl">Our Service to Deliver Comfort and Reliability</h3>
            <p className="mt-3 text-sm text-black/60 leading-relaxed">
              From chauffeur arrival to final drop-off, we manage timing, routing and door service. You focus on the moment while we handle the details.
            </p>
            <div className="mt-5">
              <a href="#booking" className="btn btn-dark">Contact Us</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Booking() {
  const [form, setForm] = useState({ name: "", email: "", date: "", car: "Rolls-Royce Ghost", notes: "" });

  function update(k, v) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function submit(e) {
    e.preventDefault();
    const subject = encodeURIComponent("Wedding Car Hire Quote Request");
    const body = encodeURIComponent(
      `Name: ${form.name}\nEmail: ${form.email}\nDate: ${form.date}\nPreferred Car: ${form.car}\nNotes: ${form.notes}`
    );
    window.location.href = `mailto:hello@example.com?subject=${subject}&body=${body}`;
  }

  return (
    <section id="booking" className="bg-brandDark">
      <div className="container-max py-12 md:py-14 grid md:grid-cols-2 gap-10 items-start">
        <div className="text-white">
          <div className="eyebrow text-white/70">Quick booking</div>
          <h3 className="mt-2 font-serif text-2xl md:text-3xl">Use our quick booking form to get your dream car</h3>
          <p className="mt-4 text-sm text-white/70 leading-relaxed">
            Share your date and preferred vehicle. We’ll confirm availability, package pricing, and timing suggestions.
          </p>

          <div className="mt-6 space-y-3 text-sm text-white/75">
            <div className="flex items-center gap-2"><span className="text-brandGold"><Icon type="phone" /></span> Fast response via email/phone</div>
            <div className="flex items-center gap-2"><span className="text-brandGold"><Icon type="clock" /></span> Flexible itineraries & photo stops</div>
            <div className="flex items-center gap-2"><span className="text-brandGold"><Icon type="shield" /></span> Professional chauffeurs included</div>
          </div>
        </div>

        <div className="card p-6">
          <div className="font-serif text-xl text-brandDark">Request a Quote</div>
          <form className="mt-4 space-y-3" onSubmit={submit}>
            <input
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brandGold/30"
              placeholder="Full name"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              required
            />
            <input
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brandGold/30"
              placeholder="Email address"
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              required
            />
            <input
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brandGold/30"
              placeholder="Event date"
              type="date"
              value={form.date}
              onChange={(e) => update("date", e.target.value)}
              required
            />
            <select
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brandGold/30"
              value={form.car}
              onChange={(e) => update("car", e.target.value)}
            >
              <option>Rolls-Royce Ghost</option>
              <option>Rolls-Royce Phantom</option>
              <option>Bentley Continental GT</option>
              <option>Mercedes S-Class</option>
              <option>Luxury Vintage Classic</option>
              <option>Supercar Package</option>
            </select>
            <textarea
              className="w-full min-h-[90px] rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brandGold/30"
              placeholder="Pickup, ceremony, reception, photo stops…"
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
            />
            <button className="btn btn-gold w-full" type="submit">Send enquiry</button>
            <div className="mt-3 text-[12px] text-black/50">
              This demo uses mailto:. Replace with your backend/WhatsApp as needed.
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  const faqs = useMemo(() => ([
    { q: "How far in advance should we book?", a: "Peak weekends: 4–8 weeks. Weekdays/off-season: 1–3 weeks is often enough." },
    { q: "Is a chauffeur included?", a: "Yes. Standard wedding hire includes a professional chauffeur and door service." },
    { q: "Can we view vehicles before booking?", a: "Yes. We can arrange a viewing or a video walk-around." },
    { q: "Do you allow multiple stops for photos?", a: "Absolutely. Add ceremony → photos → reception stops, plus bridal exit runs." },
    { q: "What happens if it rains?", a: "We assist with umbrellas and covered positioning so your entry stays smooth." }
  ]), []);
  const [open, setOpen] = useState(0);

  return (
    <section id="faq" className="py-12 md:py-14">
      <div className="container-max">
        <div className="text-center">
          <h3 className="font-serif text-2xl md:text-3xl">Frequently asked Questions</h3>
        </div>

        <div className="mt-7 mx-auto max-w-4xl card overflow-hidden">
          {faqs.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={f.q} className="border-t border-black/10 first:border-t-0 p-5">
                <button
                  className="w-full flex items-center justify-between gap-4 text-left"
                  onClick={() => setOpen(isOpen ? -1 : i)}
                >
                  <div className="font-medium text-brandDark">{f.q}</div>
                  <span className={cx("grid h-8 w-8 place-items-center rounded-full ring-1",
                    isOpen ? "bg-brandGold/15 ring-brandGold/30 text-brandGold" : "bg-[#f6f3ef] ring-black/10 text-black/60"
                  )}>
                    {isOpen ? "−" : "+"}
                  </span>
                </button>
                {isOpen && <p className="mt-3 text-sm text-black/60 leading-relaxed">{f.a}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-brandDark text-white/70">
      <div className="container-max py-10">
        <div className="grid md:grid-cols-4 gap-8 text-sm">
          <div>
            <div className="font-serif text-white text-lg">Wedding Cars</div>
            <p className="mt-3 text-white/60 text-sm leading-relaxed">
              Luxury & vintage wedding car hire with professional chauffeurs. Designed for calm timing and photo-perfect arrivals.
            </p>
          </div>
          <div>
            <div className="font-semibold text-white">Quick Links</div>
            <ul className="mt-3 space-y-2">
              <li><a className="hover:text-white" href="#fleet">Fleet</a></li>
              <li><a className="hover:text-white" href="#services">Services</a></li>
              <li><a className="hover:text-white" href="#about">About</a></li>
              <li><a className="hover:text-white" href="#booking">Booking</a></li>
            </ul>
          </div>
          <div>
            <div className="font-semibold text-white">Contact</div>
            <ul className="mt-3 space-y-2">
              <li className="flex items-center gap-2"><span className="text-brandGold"><Icon type="phone" /></span> +675 7000 0000</li>
              <li className="flex items-center gap-2"><span className="text-brandGold"><Icon type="pin" /></span> Port Moresby & regional</li>
              <li>hello@example.com</li>
            </ul>
          </div>
          <div>
            <div className="font-semibold text-white">Hours</div>
            <div className="mt-3 text-white/60">Mon – Sun: 7:00am – 9:00pm</div>
            <div className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-white/5 border border-white/10 px-4 py-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10 text-brandGold font-serif">WC</div>
              <div>
                <div className="text-white font-semibold leading-tight">Premium Hire</div>
                <div className="text-[11px] tracking-[0.22em] uppercase text-white/60">Wedding Cars</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-white/10 pt-5 text-xs text-white/50 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>© {new Date().getFullYear()} Wedding Cars. All rights reserved.</div>
          <div>Designed to match the provided layout structure.</div>
        </div>
      </div>
    </footer>
  );
}

export default function App() {
  const cars = useMemo(() => ([
    { name: "Lamborghini Huracán", stars: 5, reviews: 128, location: "City", price: "K 2,500", seats: "2", doors: "2", class: "Sport", desc: "Make an unforgettable entrance with a supercar statement.", image: "https://images.unsplash.com/photo-1603386329225-868f9b1ee6d9?auto=format&fit=crop&w=1200&q=80" },
    { name: "Rolls-Royce Ghost", stars: 5, reviews: 96, location: "City", price: "K 2,200", seats: "4", doors: "4", class: "Luxury", desc: "Quiet, smooth comfort with timeless prestige.", image: "https://images.unsplash.com/photo-1618843479313-40f8c7d8dd3b?auto=format&fit=crop&w=1200&q=80" },
    { name: "Mercedes AMG GT", stars: 5, reviews: 77, location: "City", price: "K 1,650", seats: "2", doors: "2", class: "Sport", desc: "Modern elegance with bold lines and performance.", image: "https://images.unsplash.com/photo-1504215680853-026ed2a45def?auto=format&fit=crop&w=1200&q=80" },
    { name: "Chevrolet Camaro", stars: 5, reviews: 61, location: "Regional", price: "K 1,250", seats: "4", doors: "2", class: "Classic", desc: "Iconic muscle styling for standout photos.", image: "https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=1200&q=80" },
    { name: "Audi R8", stars: 5, reviews: 83, location: "City", price: "K 1,800", seats: "2", doors: "2", class: "Sport", desc: "Sleek shape and premium presence on camera.", image: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=1200&q=80" },
    { name: "Rolls-Royce Phantom", stars: 5, reviews: 110, location: "City", price: "K 2,800", seats: "4", doors: "4", class: "Luxury", desc: "The ultimate statement of flagship luxury.", image: "https://images.unsplash.com/photo-1553440569-bcc63803a83d?auto=format&fit=crop&w=1200&q=80" },
    { name: "Bentley Continental GT", stars: 5, reviews: 74, location: "City", price: "K 2,100", seats: "4", doors: "2", class: "Luxury", desc: "Grand touring comfort with premium finish.", image: "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&w=1200&q=80" },
    { name: "Jaguar F‑Type", stars: 5, reviews: 58, location: "City", price: "K 1,450", seats: "2", doors: "2", class: "Sport", desc: "A modern classic that photographs beautifully.", image: "https://images.unsplash.com/photo-1550355291-bbee04a92027?auto=format&fit=crop&w=1200&q=80" },
    { name: "Mercedes S‑Class", stars: 5, reviews: 89, location: "City", price: "K 1,350", seats: "4", doors: "4", class: "Exec", desc: "Smooth ride and refined chauffeur experience.", image: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1200&q=80" },
    { name: "BMW M4", stars: 5, reviews: 67, location: "City", price: "K 1,500", seats: "4", doors: "2", class: "Sport", desc: "Clean look with performance luxury appeal.", image: "https://images.unsplash.com/photo-1525609004556-c46c7d6cf023?auto=format&fit=crop&w=1200&q=80" },
    { name: "Porsche 911", stars: 5, reviews: 92, location: "City", price: "K 1,900", seats: "2+2", doors: "2", class: "Icon", desc: "Iconic silhouette for timeless wedding shots.", image: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80" },
    { name: "Range Rover Vogue", stars: 5, reviews: 64, location: "Regional", price: "K 1,400", seats: "5", doors: "4", class: "SUV", desc: "Space and presence for bridal parties.", image: "https://images.unsplash.com/photo-1511919884226-fd3cad34687c?auto=format&fit=crop&w=1200&q=80" }
  ]), []);

  return (
    <div className="min-h-screen font-sans text-brandDark bg-pageBg">
      <TopBar />
      <Nav />
      <Hero />
      <Fleet cars={cars} />
      <ComfortSplit />
      <AboutSpecialists />
      <Testimonials />
      <ServiceCards />
      <Alternating />
      <Booking />
      <FAQ />
      <Footer />
    </div>
  );
}
