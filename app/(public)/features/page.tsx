import type { Metadata } from "next";

import { FeatureStory } from "./feature-story";

export const metadata: Metadata = {
  title: "Features - what a living knowledge engine unlocks | Athena",
  description:
    "Over 100 things Athena does for your whole org, told as one story: it learns your company, anyone can ask it anything, you see how everything connects, work flows with humans in charge, and you control every dollar of AI spend.",
};

export default function FeaturesPage() {
  return <FeatureStory />;
}
