"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Clock, Sparkles, ThumbsUp, Flame } from "lucide-react";

interface RecipeSlide {
  id: string;
  title: string;
  tagline: string;
  image: string;
  diet: string;
  pantryMatch: number;
  time: string;
  calories: string;
  votes: { name: string; avatar: string }[];
  agreement: string;
}

const RECIPES: RecipeSlide[] = [
  {
    id: "tofu-bowl",
    title: "Crispy Tofu Rainbow Bowls",
    tagline: "High-protein baked tofu, edamame, purple cabbage & spicy peanut drizzle",
    image: "/images/crispy-tofu-bowl.jpg",
    diet: "Vegetarian",
    pantryMatch: 94,
    time: "20 mins",
    calories: "480 kcal",
    votes: [
      { name: "Sam", avatar: "🧑" },
      { name: "Priya", avatar: "👩" },
      { name: "Dev", avatar: "🧑" },
    ],
    agreement: "3/3 Flatmates Agree",
  },
  {
    id: "tuscan-salmon",
    title: "Creamy Garlic Tuscan Salmon",
    tagline: "Pan-seared fillets, sun-dried tomatoes, wilted baby spinach & parmesan",
    image: "/images/tuscan-salmon-pasta.jpg",
    diet: "Pescatarian",
    pantryMatch: 89,
    time: "25 mins",
    calories: "540 kcal",
    votes: [
      { name: "Maya", avatar: "👩" },
      { name: "Alex", avatar: "🧑" },
      { name: "Liam", avatar: "🧑" },
      { name: "Priya", avatar: "👩" },
    ],
    agreement: "4/4 Flatmates Agree",
  },
  {
    id: "butter-chicken",
    title: "Slow-Cooked Butter Chicken & Naan",
    tagline: "Silky spiced curry, fresh cream swirl & charred garlic butter naan",
    image: "/images/butter-chicken-naan.jpg",
    diet: "Comfort Food",
    pantryMatch: 92,
    time: "35 mins",
    calories: "620 kcal",
    votes: [
      { name: "Liam", avatar: "🧑" },
      { name: "Dev", avatar: "🧑" },
      { name: "Sarah", avatar: "👩" },
    ],
    agreement: "Unanimous Vote Tonight",
  },
  {
    id: "thali-feast",
    title: "Weekend Shared Indian Thali",
    tagline: "Creamy dal makhani, paneer tikka, spiced potatoes & fragrant basmati",
    image: "/images/hero-thali.jpg",
    diet: "Shared Feast",
    pantryMatch: 96,
    time: "40 mins",
    calories: "Balanced",
    votes: [
      { name: "Raj", avatar: "🧑" },
      { name: "Emily", avatar: "👩" },
      { name: "Chris", avatar: "🧑" },
      { name: "Maya", avatar: "👩" },
    ],
    agreement: "Friday Night Special",
  },
];

export function RecipeShowcase() {
  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % RECIPES.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [isPaused]);

  const current = RECIPES[index];

  const handlePrev = () => {
    setIndex((prev) => (prev - 1 + RECIPES.length) % RECIPES.length);
  };

  const handleNext = () => {
    setIndex((prev) => (prev + 1) % RECIPES.length);
  };

  return (
    <div
      className="relative flex flex-col items-center justify-center w-full max-w-md mx-auto"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <h2 className="mb-3 text-center text-lg xl:text-xl font-bold tracking-tight text-foreground">
        Dinners everyone in the flat actually agrees on.
      </h2>

      {/* Main Bento Recipe Card */}
      <div className="w-full overflow-hidden rounded-xl border border-border/80 bg-card/80 backdrop-blur-md shadow-lg transition-all duration-300">
        {/* Recipe Image with overlay badge */}
        <div className="relative h-40 xl:h-44 w-full overflow-hidden bg-muted">
          <Image
            src={current.image}
            alt={current.title}
            fill
            sizes="(max-width: 1024px) 100vw, 450px"
            priority={index === 0}
            className="object-cover transition-opacity duration-500 ease-in-out"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />

          {/* Floating Badges */}
          <div className="absolute top-2.5 left-2.5 flex items-center gap-2">
            <span className="rounded-full bg-black/60 backdrop-blur-md px-2 py-0.5 text-[11px] font-medium text-white shadow-xs">
              {current.diet}
            </span>
          </div>

          <div className="absolute top-2.5 right-2.5 flex items-center gap-1 rounded-full bg-emerald-500/90 backdrop-blur-md px-2 py-0.5 text-[11px] font-semibold text-white shadow-xs">
            <Sparkles className="size-3" />
            <span>{current.pantryMatch}% Pantry Match</span>
          </div>

          {/* Bottom Time & Calorie Chips on image */}
          <div className="absolute bottom-2.5 left-2.5 flex items-center gap-2 text-[11px] font-medium text-white/95">
            <span className="flex items-center gap-1 rounded bg-black/50 backdrop-blur-md px-1.5 py-0.5">
              <Clock className="size-3" /> {current.time}
            </span>
            <span className="flex items-center gap-1 rounded bg-black/50 backdrop-blur-md px-1.5 py-0.5">
              <Flame className="size-3" /> {current.calories}
            </span>
          </div>
        </div>

        {/* Card Body */}
        <div className="p-3.5 space-y-2.5">
          <div>
            <h3 className="text-base font-bold text-card-foreground leading-snug">
              {current.title}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {current.tagline}
            </p>
          </div>

          {/* Roommate Votes Breakdown */}
          <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-1.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-muted-foreground">Votes:</span>
              <div className="flex items-center -space-x-1.5">
                {current.votes.map((v, i) => (
                  <div
                    key={i}
                    title={`${v.name} voted yes`}
                    className="flex size-6 items-center justify-center rounded-full border-2 border-background bg-card text-[11px] shadow-xs"
                  >
                    <span>{v.avatar}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              <ThumbsUp className="size-2.5" />
              <span>{current.agreement}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Controls & Indicators */}
      <div className="mt-3 flex items-center justify-between w-full px-1">
        <button
          type="button"
          onClick={handlePrev}
          aria-label="Previous recipe"
          className="flex size-7 items-center justify-center rounded-full border border-border/80 bg-background/80 hover:bg-accent text-foreground transition-all cursor-pointer shadow-xs active:scale-95"
        >
          <ChevronLeft className="size-3.5" />
        </button>

        {/* Dots Indicator */}
        <div className="flex items-center gap-1.5">
          {RECIPES.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all cursor-pointer ${
                i === index
                  ? "w-5 bg-primary"
                  : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
              }`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={handleNext}
          aria-label="Next recipe"
          className="flex size-7 items-center justify-center rounded-full border border-border/80 bg-background/80 hover:bg-accent text-foreground transition-all cursor-pointer shadow-xs active:scale-95"
        >
          <ChevronRight className="size-3.5" />
        </button>
      </div>

      {/* Social Quote */}
      <p className="mt-2 text-center text-[11px] text-muted-foreground italic">
        &ldquo;No more 7 PM &lsquo;what are we eating tonight?&rsquo; group chat panic.&rdquo;
      </p>
    </div>
  );
}

