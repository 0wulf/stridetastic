from django.db import models

class Channel(models.Model):
    """
    Represents a Meshtastic channel.
    """
    interfaces = models.ManyToManyField('Interface', related_name='channels', help_text="Interfaces this channel belongs to.")
    channel_id = models.CharField(max_length=13, default="LongFast", help_text="Name of the channel.")
    channel_num = models.IntegerField(default=0, help_text="Channel Number (0-255).")
    psk = models.CharField(max_length=255, help_text="AES encryption key for the channel.", blank=True, null=True)
    members = models.ManyToManyField('Node', related_name='channels', help_text="Nodes that have sent messages to this channel.")

    first_seen = models.DateTimeField(auto_now_add=True, help_text="Timestamp when the channel was first seen.")
    last_seen = models.DateTimeField(auto_now=True, help_text="Timestamp when the channel was last seen.")

    class Meta:
        verbose_name = "Channel"
        verbose_name_plural = "Channels"
        ordering = ['last_seen']

    def __str__(self):
        return self.channel_id
    
    def get_statistics(self):
        """
        Returns statistics for the channel.
        This method should be implemented to return relevant statistics.
        """
        packets = self.packets.all()
        total_messages = packets.count()
        has_broadcast = 1 if self.members.filter(node_id='!ffffffff').exists() else 0
        members_count = self.members.count() - has_broadcast
    
        if total_messages == 0:
            return None
        
        return {
            "channel_id": self.channel_id,
            "channel_num": self.channel_num,
            "total_messages": total_messages,
            "first_seen": self.first_seen,
            "last_seen": self.last_seen,
            "members_count": members_count
        }