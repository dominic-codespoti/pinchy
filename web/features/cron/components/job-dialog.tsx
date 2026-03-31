'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { CronJob } from '../types';
import cronstrue from 'cronstrue';
import { cn } from '@/shared/lib/utils';

const formSchema = z.object({
  agentId: z.string().min(1, 'Agent is required'),
  schedule: z.string().min(1, 'Schedule is required'),
  message: z.string().min(1, 'Message is required'),
  enabled: z.boolean(),
});

export type JobFormData = z.infer<typeof formSchema>;

interface JobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: CronJob | null;
  agents?: { id: string; name: string }[];
  onSave: (data: JobFormData) => void;
}

export function JobDialog({ open, onOpenChange, job, agents, onSave }: JobDialogProps) {
  const [scheduleDescription, setScheduleDescription] = React.useState<string>('');

  const form = useForm<JobFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      agentId: '',
      schedule: '',
      message: '',
      enabled: true,
    },
  });

  React.useEffect(() => {
    if (open) {
      if (job) {
        form.reset({
          agentId: job.agentId,
          schedule: job.schedule,
          message: job.message,
          enabled: job.lastStatus,
        });
      } else {
        form.reset({
          agentId: '',
          schedule: '',
          message: '',
          enabled: true,
        });
      }
    }
  }, [job, open, form]);

  const schedule = form.watch('schedule');

  React.useEffect(() => {
    if (schedule) {
      try {
        const desc = cronstrue.toString(schedule, { use24HourTimeFormat: true });
        setScheduleDescription(desc);
        form.clearErrors('schedule');
      } catch {
        setScheduleDescription('Invalid cron expression');
        form.setError('schedule', { message: 'Invalid cron expression' });
      }
    } else {
      setScheduleDescription('');
    }
  }, [schedule, form]);

  const onSubmit = (data: JobFormData) => {
    onSave(data);
  };

  const isEditing = !!job;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Job' : 'New Job'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="agentId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Agent</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an agent" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {agents?.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="schedule"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Schedule (Cron Expression)</FormLabel>
                  <FormControl>
                    <Input placeholder="0 9 * * *" {...field} />
                  </FormControl>
                  <FormDescription
                    className={cn(
                      form.formState.errors.schedule && 'text-destructive'
                    )}
                  >
                    {scheduleDescription || 'Enter a cron expression (e.g., 0 9 * * *)'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Message</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter the message to send..."
                      rows={4}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Enabled</FormLabel>
                  <FormDescription>
                      This job will run according to the schedule when enabled.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit">{isEditing ? 'Save Changes' : 'Create Job'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

JobDialog.displayName = 'JobDialog';
