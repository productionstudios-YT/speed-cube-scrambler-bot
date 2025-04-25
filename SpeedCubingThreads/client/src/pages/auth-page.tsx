import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { loginSchema } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Dice5 } from "lucide-react";

export default function AuthPage() {
  const [activeTab, setActiveTab] = useState<string>("login");
  const { user, loginMutation } = useAuth();
  const [, navigate] = useLocation();

  // Use effect for navigation and cookie debug
  useEffect(() => {
    if (user) {
      navigate("/");
    }
    // Debug: Log available cookies on component mount and every 3 seconds
    console.log("Auth page - Available cookies:", document.cookie);
    
    const interval = setInterval(() => {
      console.log("Auth page cookie check:", document.cookie);
    }, 3000);
    
    return () => clearInterval(interval);
  }, [user, navigate]);

  return (
    <div className="flex min-h-screen">
      {/* Left Column (Form) */}
      <div className="flex-1 flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <Dice5 className="mx-auto h-12 w-12 text-primary" />
            <h2 className="mt-6 text-3xl font-bold tracking-tight">SpeedCube Scrambler</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Admin Dashboard
            </p>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-1">
              <TabsTrigger value="login">Login</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <LoginForm isLoading={loginMutation.isPending} onSubmit={(data) => loginMutation.mutate(data)} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Right Column (Hero) */}
      <div className="hidden lg:flex flex-1 items-center justify-center bg-gradient-to-r from-blue-500 to-purple-600 text-white">
        <div className="max-w-xl px-8">
          <h1 className="text-4xl font-bold mb-6">Daily Scramble Bot Dashboard</h1>
          <p className="text-xl mb-8">
            Monitor and configure your Discord speedcubing scramble bot. Track active threads, update bot settings, and create manual scrambles.
          </p>
          <div className="space-y-4">
            <div className="flex items-start">
              <div className="flex-shrink-0 bg-white/20 p-2 rounded">
                <Dice5 className="h-6 w-6" />
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-medium">Scheduled Challenges</h3>
                <p className="mt-1">Different cube types every day of the week</p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="flex-shrink-0 bg-white/20 p-2 rounded">
                <Dice5 className="h-6 w-6" />
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-medium">Automatic Thread Management</h3>
                <p className="mt-1">Threads are automatically cleaned up after 24 hours</p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="flex-shrink-0 bg-white/20 p-2 rounded">
                <Dice5 className="h-6 w-6" />
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-medium">Custom Configuration</h3>
                <p className="mt-1">Customize settings for guild, channel, and posting time</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoginForm({ isLoading, onSubmit }: { isLoading: boolean; onSubmit: (data: z.infer<typeof loginSchema>) => void }) {
  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  // Handle form submission with debugging
  const handleSubmit = async (data: z.infer<typeof loginSchema>) => {
    console.log("Login attempt with username:", data.username);
    console.log("Cookies before login:", document.cookie);
    
    // Call the original submit function from props
    onSubmit(data);
    
    // Add a timeout to check for cookies after the request
    setTimeout(() => {
      console.log("Cookies after login attempt:", document.cookie);
    }, 1000);
  };

  // Form handling is complete

  return (
    <Card>
      <CardHeader>
        <CardTitle>Login to Dashboard</CardTitle>
        <CardDescription>
          Enter your credentials to access the bot control panel
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input placeholder="username" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Login
            </Button>
          </form>
        </Form>
      </CardContent>
      <CardFooter className="flex justify-center text-sm text-muted-foreground">
        <p>For access, contact the administrator</p>
      </CardFooter>
    </Card>
  );
}