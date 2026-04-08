import Button from "@platform/ui/components/ui/Button";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
          MyRestaurantReviews
        </h1>
        <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
          Track your dining experiences
        </p>
        <div className="mt-8">
          <Button>Get Started</Button>
        </div>
      </div>
    </div>
  );
}
