import { GoogleButton } from "../../src/ui/google-button";
import { SignUpForm } from "./form";

export const metadata = { title: "Create your account · Trustbook" };

export default function SignUpPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <h1 className="text-3xl font-bold">Create your account</h1>
      <p className="mt-2 text-stone-700">Then you set up your shop. Your book stays yours: it is saved to Walrus every night.</p>
      <GoogleButton />
      <div className="mt-6">
        <SignUpForm />
      </div>
      <p className="mt-6 text-center">
        Already have an account?{" "}
        <a href="/login" className="font-semibold text-emerald-800 underline">
          Sign in
        </a>
      </p>
    </main>
  );
}
